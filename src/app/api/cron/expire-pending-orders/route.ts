import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verify-cron-secret";
import { createServiceClient } from "@/lib/supabase/service";
import { PENDING_EXPIRY_MINUTES } from "@/lib/orders/timing-config";

const BATCH_LIMIT = 200;

/**
 * PRD §10 Epic D1 AC9: "A pending order older than 30 minutes is set to
 * expired by a scheduled job, freeing the listing." §11.1 HARD RULE: "cron
 * routes verify a secret header... idempotent and safe to run
 * concurrently."
 *
 * Idempotent by construction: `expire_pending_order` (migration
 * 20260729110000) only transitions rows where `status = 'pending'` — a
 * second run (or a concurrent one) finds nothing left to do for an
 * already-expired order and no-ops, never double-writing an audit row.
 *
 * Both GET and POST are exported: Vercel Cron's actual, documented
 * invocation mechanism sends GET requests, but PRD §11.1's own route table
 * lists this as POST — supporting both means this works regardless of
 * which is correct for the deployed environment, rather than gambling on
 * one. See docs/DECISIONS.md #63.
 */
async function handle(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const cutoff = new Date(Date.now() - PENDING_EXPIRY_MINUTES * 60_000).toISOString();

  const { data: eligible } = await service
    .from("orders")
    .select("id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(BATCH_LIMIT);

  let expiredCount = 0;
  for (const row of eligible ?? []) {
    const { data: transitioned } = await service.rpc("expire_pending_order", { p_order_id: row.id });
    if (transitioned && transitioned.length > 0) expiredCount++;
  }

  return NextResponse.json({ checked: eligible?.length ?? 0, expired: expiredCount }, { status: 200 });
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
