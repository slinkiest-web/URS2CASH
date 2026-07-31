"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { disputeInputSchema, type DisputeInput } from "@/lib/orders/dispute-schema";
import { authorizeOrderAction } from "@/lib/orders/authorize-order-action";
import { DISPUTE_WINDOW_DAYS } from "@/lib/orders/timing-config";
import { track } from "@/lib/analytics/events";
import { ok, err, type Result } from "@/lib/result";

/**
 * PRD §11.2: raiseDispute(input: DisputeInput): Result<{ disputeId }>. §10 Epic D5.
 *
 * Available on `paid`/`shipped`/`delivered`, within `DISPUTE_WINDOW_DAYS` of
 * `delivered_at` (AC1). The `authorizeOrderAction` pre-check below exists
 * for a clearer error message only — `raise_dispute()`'s own
 * `WHERE buyer_id = ... AND status IN (...) AND (delivered_at IS NULL OR
 * now() <= delivered_at + N days)` is the actual, race-safe enforcement,
 * same shape as every other order-transition RPC (Prompts 15/16).
 *
 * Sets `disputed`/`disputed_at`, prevents any future payout creation
 * (structural: `release_order()` only fires on `status = 'delivered'`,
 * which a disputed order no longer is), and holds any already-`queued`
 * payout (AC3) — the same function also does `UPDATE payouts SET
 * status='held' WHERE order_id=... AND status='queued'`, kept as a
 * HARD-RULE safety net even though provably unreachable under today's
 * state machine (see docs/DECISIONS.md).
 *
 * The cron auto-release path skips `disputed` orders for free (AC4): its
 * queries filter on `status = 'shipped'`/`'delivered'`, and a disputed
 * order no longer matches either. No cron changes needed.
 */
export async function raiseDispute(input: DisputeInput): Promise<Result<{ disputeId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in to manage this order.");
  }

  const parsed = disputeInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Check your dispute details.");
  }
  const data = parsed.data;

  const service = createServiceClient();
  const authResult = await authorizeOrderAction<{
    id: string;
    buyer_id: string;
    status: string;
    delivered_at: string | null;
  }>(service, data.orderId, user.id, {
    actorField: "buyer_id",
    allowedStatuses: ["paid", "shipped", "delivered"],
    selectColumns: "id, buyer_id, status, delivered_at",
    notAuthorizedMessage: "Only the buyer can raise a dispute on this order.",
    invalidTransitionMessage: "This order isn't eligible for a dispute.",
  });
  if (!authResult.ok) {
    return err(authResult.error.code, authResult.error.message);
  }

  const { data: transitioned, error } = await service.rpc("raise_dispute", {
    p_order_id: data.orderId,
    p_buyer_id: user.id,
    p_reason: data.reason,
    p_detail: data.detail,
    p_evidence_urls: data.evidenceUrls,
    p_window_days: DISPUTE_WINDOW_DAYS,
  });

  const dispute = transitioned?.[0];
  if (error || !dispute) {
    return err("invalid_transition", "This order isn't eligible for a dispute right now.");
  }

  // §10 Epic D5 AC5/AC6: notifies both parties + admin. Email wiring is
  // Prompt 22's scope (same as every other order_* event so far); admin
  // "notification" is the dispute row itself (status='open'), the future
  // Epic E2 queue's input, same precedent as moderation_flags (Decision #58).
  track("order_disputed", { order_id: data.orderId, dispute_reason: data.reason });

  return ok({ disputeId: dispute.id });
}

/**
 * PRD §11.2: resolveDispute(disputeId, outcome, notes): Result<void>. Admin
 * action. Signature-only stub for this prompt — Prompt 19 builds the real
 * admin UI and resolution logic (transition to `released`/`refunded`,
 * payout creation/refund per §10 Epic E2 AC2/AC3, `order_status_transitions`,
 * `dispute_upheld_count` via the Prompt 6 trigger). Deliberately not wired
 * to anything yet: no admin-role verification mechanism exists (Known
 * Issue #12), and building resolution logic ahead of that would have
 * nothing legitimate to gate it.
 */
export async function resolveDispute(
  disputeId: string,
  outcome: "buyer" | "seller",
  notes: string
): Promise<Result<void>> {
  void disputeId;
  void outcome;
  void notes;
  return err("not_implemented", "Dispute resolution is not yet available.");
}
