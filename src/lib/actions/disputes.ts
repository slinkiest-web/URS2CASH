"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { disputeInputSchema, type DisputeInput } from "@/lib/orders/dispute-schema";
import { authorizeOrderAction } from "@/lib/orders/authorize-order-action";
import { DISPUTE_WINDOW_DAYS } from "@/lib/orders/timing-config";
import { requireAdmin } from "@/lib/admin/require-admin";
import { resolveDisputeInputSchema } from "@/lib/admin/admin-schemas";
import { refundTransaction } from "@/lib/paystack";
import { trackOrderReleased } from "@/lib/orders/order-events";
import { track } from "@/lib/analytics/track-server";
import { sendDisputeOpenedEmails, sendDisputeResolvedEmails } from "@/lib/email/senders/dispute-emails";
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

  await track("order_disputed", { order_id: data.orderId, dispute_reason: data.reason }, user.id);

  // §10 Epic D5 AC6: "Both parties and admin notified." Best-effort — a
  // send failure is logged, never fails the dispute itself (the dispute
  // row already committed above).
  await sendDisputeOpenedEmails(service, dispute.id);

  return ok({ disputeId: dispute.id });
}

/**
 * PRD §11.2: resolveDispute(disputeId, outcome, notes): Result<void>. §10
 * Epic E2. Admin action — fills the signature-only stub Prompt 17 left,
 * now that an admin-role mechanism exists (Prompt 19,
 * src/lib/admin/require-admin.ts).
 *
 * AC4: `admin_notes` is required (enforced by `resolveDisputeInputSchema`,
 * min 10 chars — not "resolvable with an empty string").
 *
 * Seller path (AC2): `resolve_dispute_release()` (Prompt 19's migration)
 * does the `disputed` -> `released` transition and creates the payout row
 * atomically, in the same shape as `release_order` (Prompt 16) — this is
 * "creates the payout normally," not a special admin-only payout path.
 *
 * Buyer path (AC3): the Paystack refund is called FIRST, and the DB is only
 * flipped to `refunded` if that call succeeds — the mirror image of
 * `initiateCheckout`'s own sequencing (create the provisional row, then
 * call Paystack, then roll back on failure). Getting this order backwards
 * here would risk telling a buyer "refunded" when no money actually moved.
 * `resolve_dispute_refund()` creates no payout row at all — provably
 * correct with zero extra guard code, since a disputed order can never have
 * held one to begin with (see that function's own comment) — this is the
 * literal mechanism behind "must not pay the seller," not a check bolted on
 * afterward.
 *
 * No `dispute_resolved` event exists in §3.5's event table (grepped —
 * zero hits); the resolution instead fires the two PRD-sanctioned events
 * that already exist for exactly these state transitions, `order_released`
 * and `order_refunded`, same as every other path that reaches those
 * states. See docs/DECISIONS.md.
 *
 * AC5 (both parties emailed) is a call site only — every other order/rating
 * lifecycle notification in this codebase is the same shape, deferred to
 * Prompt 22 (Decision precedent: Prompts 15-18).
 */
export async function resolveDispute(disputeId: string, outcome: "buyer" | "seller", notes: string): Promise<Result<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return err(admin.error.code, admin.error.message);
  }

  const parsed = resolveDisputeInputSchema.safeParse({ disputeId, outcome, notes });
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Check the resolution notes.");
  }
  const data = parsed.data;

  const service = createServiceClient();

  const { data: dispute } = await service.from("disputes").select("id, order_id, status").eq("id", data.disputeId).maybeSingle();
  if (!dispute) {
    return err("not_found", "Dispute not found.");
  }
  if (dispute.status !== "open") {
    return err("invalid_transition", "This dispute has already been resolved.");
  }

  const { data: order } = await service
    .from("orders")
    .select("id, listing_id, status, amount_kobo, paystack_reference, buyer_id")
    .eq("id", dispute.order_id)
    .maybeSingle();
  if (!order || order.status !== "disputed") {
    return err("invalid_transition", "This order isn't ready to be resolved.");
  }

  if (data.outcome === "seller") {
    const { data: transitioned, error } = await service.rpc("resolve_dispute_release", {
      p_dispute_id: data.disputeId,
      p_admin_id: admin.data.adminId,
      p_notes: data.notes,
    });

    const releasedOrder = transitioned?.[0];
    if (error || !releasedOrder) {
      return err("resolution_failed", "Could not resolve this dispute. Try again.");
    }

    await trackOrderReleased(service, releasedOrder);
    // §10 Epic E2 AC5: "Both parties emailed the outcome."
    await sendDisputeResolvedEmails(service, data.disputeId);
    return ok(undefined);
  }

  // Buyer path: refund via Paystack BEFORE touching any DB state.
  if (!order.paystack_reference) {
    return err("resolution_failed", "This order has no payment reference to refund.");
  }

  const refund = await refundTransaction({ reference: order.paystack_reference, amountKobo: order.amount_kobo });
  if (!refund.ok) {
    return err("refund_failed", refund.error);
  }

  const { data: refundedTransitioned, error: refundDbError } = await service.rpc("resolve_dispute_refund", {
    p_dispute_id: data.disputeId,
    p_admin_id: admin.data.adminId,
    p_notes: data.notes,
  });

  const refundedOrder = refundedTransitioned?.[0];
  if (refundDbError || !refundedOrder) {
    // The Paystack refund already succeeded but the DB transition failed —
    // logged for manual reconciliation rather than silently swallowed; the
    // buyer's money is genuinely on its way back regardless of this error.
    console.error("[resolveDispute] Paystack refund succeeded but DB transition failed", {
      disputeId: data.disputeId,
      orderId: order.id,
      error: refundDbError,
    });
    return err("resolution_failed", "The refund was processed but the order could not be updated. Contact engineering.");
  }

  await track("order_refunded", { order_id: order.id, refund_reason: data.notes }, order.buyer_id);
  // §10 Epic E2 AC5: "Both parties emailed the outcome."
  await sendDisputeResolvedEmails(service, data.disputeId);
  return ok(undefined);
}
