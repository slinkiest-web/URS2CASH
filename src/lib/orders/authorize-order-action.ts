/**
 * Shared guard for order-lifecycle server actions (markShipped,
 * confirmDelivery, releaseOrder, raiseDispute): fetch the order, confirm
 * the caller is the expected actor (buyer or seller), confirm the order is
 * in an allowed status — then hand back exactly the columns the caller
 * asked for, typed.
 *
 * Extracted in Prompt 17 after raiseDispute became the 4th action with this
 * identical inline shape (none of the prior three had extracted it).
 * `selectColumns` + the explicit `Row` generic exist because each caller
 * needs different extra columns beyond id/status/actor (markShipped needs
 * `paid_at` for its `hours_since_paid` analytics property, confirmDelivery
 * needs `shipped_at`, raiseDispute needs `delivered_at` for its window
 * check) — an earlier draft of this helper had no such mechanism and would
 * have silently dropped those columns during the refactor, caught by an
 * outside-voice review before it shipped.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ok, err, type Result } from "@/lib/result";

type ServiceClient = SupabaseClient<Database>;

export async function authorizeOrderAction<Row extends { id: string; status: string }>(
  service: ServiceClient,
  orderId: string,
  userId: string,
  opts: {
    actorField: "buyer_id" | "seller_id";
    allowedStatuses: readonly string[];
    selectColumns: string;
    notAuthorizedMessage: string;
    invalidTransitionMessage: string;
  }
): Promise<Result<Row>> {
  const { data: order } = await service
    .from("orders")
    .select(opts.selectColumns)
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    return err("not_found", "Order not found.");
  }

  const row = order as unknown as Row & Record<string, unknown>;

  if (row[opts.actorField] !== userId) {
    return err("not_authorized", opts.notAuthorizedMessage);
  }

  if (!opts.allowedStatuses.includes(row.status)) {
    return err("invalid_transition", opts.invalidTransitionMessage);
  }

  return ok(row as Row);
}
