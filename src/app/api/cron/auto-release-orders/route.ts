import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verify-cron-secret";
import { createServiceClient } from "@/lib/supabase/service";
import { DELIVERED_AUTO_RELEASE_HOURS } from "@/lib/orders/timing-config";
import { trackOrderReleased } from "@/lib/orders/order-events";

const BATCH_LIMIT = 200;

/**
 * PRD §10 Epic D4 AC5 / §12.4 ("auto release hourly" — one named job).
 * Handles both time-based transitions past `shipped`, since AC5 describes
 * a single scheduled job: `shipped` orders past `auto_release_at` (7 days
 * from `shipped_at`, computed and stored at ship time — no config lookup
 * needed here, the deadline is already on the row) are auto-advanced to
 * `delivered` ("following the same path" as a buyer's manual
 * confirmDelivery — see the migration's own comment on
 * `auto_advance_shipped_to_delivered`); then, independently, `delivered`
 * orders past the config-driven auto-release window are released.
 *
 * §10 Epic D5 AC4 / this prompt's HARD RULE ("auto-transitions skip
 * disputed orders"): structural, not an extra check — a disputed order's
 * `status` is `'disputed'`, which matches neither `= 'shipped'` nor `=
 * 'delivered'`, so it's excluded by the query itself, the same way Prompt
 * 14's amount/reference checks excluded non-`pending` orders.
 *
 * Idempotent and safe to run concurrently, same reasoning as
 * expire-pending-orders: both RPCs only transition rows currently in the
 * expected prior status. Both GET and POST exported — see
 * expire-pending-orders/route.ts's comment and docs/DECISIONS.md #63.
 */
async function handle(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: eligibleShipped } = await service
    .from("orders")
    .select("id")
    .eq("status", "shipped")
    .lte("auto_release_at", nowIso)
    .limit(BATCH_LIMIT);

  let autoDeliveredCount = 0;
  for (const row of eligibleShipped ?? []) {
    const { data: transitioned } = await service.rpc("auto_advance_shipped_to_delivered", { p_order_id: row.id });
    if (transitioned && transitioned.length > 0) autoDeliveredCount++;
  }

  const deliveredCutoff = new Date(Date.now() - DELIVERED_AUTO_RELEASE_HOURS * 3_600_000).toISOString();
  const { data: eligibleDelivered } = await service
    .from("orders")
    .select("id")
    .eq("status", "delivered")
    .lt("delivered_at", deliveredCutoff)
    .limit(BATCH_LIMIT);

  let autoReleasedCount = 0;
  for (const row of eligibleDelivered ?? []) {
    const { data: transitioned, error } = await service.rpc("release_order", {
      p_order_id: row.id,
      p_actor_role: "system",
    });
    const releasedOrder = transitioned?.[0];
    if (!error && releasedOrder) {
      // §10 Epic D4 AC6.
      await trackOrderReleased(service, releasedOrder);
      autoReleasedCount++;
    }
  }

  return NextResponse.json(
    {
      shippedChecked: eligibleShipped?.length ?? 0,
      autoDelivered: autoDeliveredCount,
      deliveredChecked: eligibleDelivered?.length ?? 0,
      autoReleased: autoReleasedCount,
    },
    { status: 200 }
  );
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
