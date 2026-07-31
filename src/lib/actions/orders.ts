"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkoutInputSchema, type CheckoutInput } from "@/lib/orders/checkout-schema";
import { SHIPPED_AUTO_RELEASE_DAYS } from "@/lib/orders/timing-config";
import { trackOrderReleased } from "@/lib/orders/order-events";
import { authorizeOrderAction } from "@/lib/orders/authorize-order-action";
import { computeCommission } from "@/lib/money";
import { initializeTransaction } from "@/lib/paystack";
import { track } from "@/lib/analytics/track-server";
import { sendOrderShippedEmail } from "@/lib/email/senders/order-emails";
import { ok, err, type Result } from "@/lib/result";

const trackingNoteSchema = z
  .string()
  .trim()
  .min(3, "Enter a tracking note of at least 3 characters.")
  .max(500, "Tracking note must be at most 500 characters.");

/**
 * PRD §11.2: initiateCheckout(input): Result<{ authorizationUrl, orderId }>.
 *
 * Scope: this creates the `pending` order, snapshots money, and calls
 * Paystack `initialize` server-side. It never writes `paid` — §10 Epic D2's
 * HARD RULE is that only the webhook (Prompt 14) does that. Nothing here
 * marks anything paid, and nothing here releases seller contact details
 * (§9.1: released only on `paid`, by the webhook).
 */
export async function initiateCheckout(
  input: CheckoutInput
): Promise<Result<{ authorizationUrl: string; orderId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // §10 Epic D1 AC1: unauthenticated buy routes to sign in — the listing
  // detail page never renders the buy form to a signed-out visitor, but
  // §11.2 requires every action to re-check authorisation server side
  // regardless of what the UI already gated.
  if (!user) {
    return err("not_authenticated", "Sign in to buy this item.");
  }

  // §10 Epic A1 AC3 / D1 AC1: an unverified email may not check out.
  if (!user.email_confirmed_at) {
    return err("email_not_confirmed", "Confirm your email before checking out.");
  }

  if (!user.email) {
    return err("order_creation_failed", "Your account is missing an email address. Contact support.");
  }
  const buyerEmail = user.email;

  const parsed = checkoutInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Check your delivery details.");
  }
  const data = parsed.data;

  const { data: listing } = await supabase
    .from("listings")
    .select("id, seller_id, price_kobo, status")
    .eq("id", data.listingId)
    .single();

  // Concurrency, item 5: a listing that's already sold (or otherwise not
  // published) gets a clear message, not a generic error. This is a
  // courtesy pre-check only — a `pending` order never changes
  // `listings.status` (only the webhook's transition to `paid` does, per
  // §8.1), so this alone cannot catch two buyers racing to check out the
  // same still-`published` listing at once. That race is handled below.
  if (!listing || listing.status !== "published") {
    return err("listing_unavailable", "This item is no longer available.");
  }

  // §10 Epic D1 AC10.
  if (listing.seller_id === user.id) {
    return err("cannot_buy_own_listing", "You can't buy your own listing.");
  }

  // §8.3 HARD RULE: computed and snapshotted at creation, integer floor,
  // stored as an amount (never a rate), never recomputed later.
  const amountKobo = listing.price_kobo;
  const commissionKobo = computeCommission(amountKobo);
  const sellerPayoutKobo = amountKobo - commissionKobo;

  // §7.2: `orders` has no INSERT policy for `authenticated` at all — "even
  // initial order creation goes through a server action using the
  // service-role client" (the migration's own RLS comment). The
  // authorization check above (`user`/email/self-purchase) is what stands
  // in for RLS here, since RLS itself grants nothing to insert against.
  const service = createServiceClient();

  const { data: order, error: insertError } = await service
    .from("orders")
    .insert({
      listing_id: listing.id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      status: "pending",
      amount_kobo: amountKobo,
      commission_kobo: commissionKobo,
      seller_payout_kobo: sellerPayoutKobo,
      delivery_name: data.deliveryName,
      delivery_state: data.deliveryState,
      delivery_address: data.deliveryAddress,
      delivery_phone: data.deliveryPhone,
    })
    .select("id")
    .single();

  if (insertError || !order) {
    // §10 Epic D1 AC8: "the race is handled by catching the constraint
    // violation, not by a pre check." Postgres 23505 (unique_violation) on
    // `orders_listing_id_active_unique` (docs/DECISIONS.md #54) is exactly
    // two buyers passing the status check above in the same instant — the
    // pre-check couldn't have caught this, only this catch can.
    if (insertError?.code === "23505") {
      return err("listing_unavailable", "Someone else is already checking out this item.");
    }
    return err("order_creation_failed", "Could not start checkout. Try again.");
  }

  // §3.5: fires once the order genuinely exists, independent of whether the
  // Paystack call below succeeds — "checkout started" is true the moment a
  // pending order is on record, not only once payment is fully underway.
  await track("checkout_started", { listing_id: listing.id, price_kobo: amountKobo }, user.id);

  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";

  // §10 Epic D1 AC6: initialized with the total (amount_kobo exactly — no
  // fee, no shipping line, per §8.4) and the order id in metadata, so the
  // webhook can correlate the eventual event back to this order.
  const init = await initializeTransaction({
    email: buyerEmail,
    amountKobo,
    orderId: order.id,
    // Prompt 14 builds this route (§10 Epic D2 AC7: reads status, writes
    // nothing) — not part of this prompt's scope, but the URL is stable to
    // reference now.
    callbackUrl: `${appUrl}/orders/${order.id}`,
  });

  if (!init.ok) {
    // This order never reached Paystack — no reference was ever shown to
    // the buyer, so it was never a real payment attempt. The 30-minute
    // expiry cron (AC9) isn't built yet (out of this prompt's scope), so
    // without deleting it here, a single transient Paystack failure would
    // permanently lock the listing with no recovery path until that job
    // exists. Best-effort: if the delete itself fails, the leftover row is
    // harmless (no `paystack_reference`, easy to identify) and gets cleaned
    // up once the expiry job lands.
    await service.from("orders").delete().eq("id", order.id);
    return err("payment_init_failed", "Could not start payment. Try again.");
  }

  const { error: updateError } = await service
    .from("orders")
    .update({ paystack_reference: init.reference })
    .eq("id", order.id);

  if (updateError) {
    return err("order_creation_failed", "Could not start checkout. Try again.");
  }

  return ok({ authorizationUrl: init.authorizationUrl, orderId: order.id });
}

/**
 * PRD §11.2: markShipped(orderId, trackingNote): Result<void>. §10 Epic D3.
 *
 * Every legal transition is enforced atomically by `mark_order_shipped`
 * (only callable via the service-role client — Prompt 15's migration) and
 * recorded in `order_status_transitions` in the same transaction as the
 * status change: "every state transition is recorded... no exceptions."
 * The pre-checks below (not found / not the seller / not `paid`) exist for
 * clearer error messages only — the RPC's own `WHERE seller_id = ... AND
 * status = 'paid'` is the actual, race-safe enforcement.
 */
export async function markShipped(orderId: string, trackingNote: string): Promise<Result<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in to manage this order.");
  }

  const parsed = trackingNoteSchema.safeParse(trackingNote);
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Enter a tracking note.");
  }

  const service = createServiceClient();
  const authResult = await authorizeOrderAction<{
    id: string;
    seller_id: string;
    status: string;
    paid_at: string | null;
  }>(service, orderId, user.id, {
    actorField: "seller_id",
    allowedStatuses: ["paid"],
    selectColumns: "id, seller_id, status, paid_at",
    notAuthorizedMessage: "Only the seller can mark this order shipped.",
    invalidTransitionMessage: "This order isn't ready to be marked shipped.",
  });
  if (!authResult.ok) {
    return err(authResult.error.code, authResult.error.message);
  }
  const order = authResult.data;

  // §8.1 HARD RULE: auto_release_at = shipped_at + 7 days. Computed here,
  // in TypeScript, from the single config source — never hardcoded in SQL.
  const autoReleaseAt = new Date(Date.now() + SHIPPED_AUTO_RELEASE_DAYS * 86_400_000).toISOString();

  const { data: transitioned, error } = await service.rpc("mark_order_shipped", {
    p_order_id: orderId,
    p_seller_id: user.id,
    p_tracking_note: parsed.data,
    p_auto_release_at: autoReleaseAt,
  });

  if (error || !transitioned || transitioned.length === 0) {
    return err("invalid_transition", "This order isn't ready to be marked shipped.");
  }

  // §10 Epic D3 AC4.
  const hoursSincePaid = order.paid_at ? Math.round((Date.now() - new Date(order.paid_at).getTime()) / 3_600_000) : 0;
  await track("order_shipped", { order_id: orderId, hours_since_paid: hoursSincePaid }, user.id);

  // §10 Epic D3 AC5: "Buyer notified by email on ship."
  await sendOrderShippedEmail(service, orderId);

  return ok(undefined);
}

/**
 * PRD §11.2: confirmDelivery(orderId): Result<void>. §10 Epic D4 AC1.
 *
 * Sets `delivered`/`delivered_at` only — does not cascade to `released`.
 * Release happens via a separate, explicit `releaseOrder` call (buyer
 * early release) or the 72-hour auto-release cron. See
 * docs/DECISIONS.md #61 for why this is the confirmed design, not a
 * literal reading of §10 Epic D4 AC2's "immediately."
 */
export async function confirmDelivery(orderId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in to manage this order.");
  }

  const service = createServiceClient();
  const authResult = await authorizeOrderAction<{
    id: string;
    buyer_id: string;
    status: string;
    shipped_at: string | null;
  }>(service, orderId, user.id, {
    actorField: "buyer_id",
    allowedStatuses: ["shipped"],
    selectColumns: "id, buyer_id, status, shipped_at",
    notAuthorizedMessage: "Only the buyer can confirm delivery.",
    invalidTransitionMessage: "This order isn't ready to confirm delivery.",
  });
  if (!authResult.ok) {
    return err(authResult.error.code, authResult.error.message);
  }
  const order = authResult.data;

  const { data: transitioned, error } = await service.rpc("confirm_order_delivered", {
    p_order_id: orderId,
    p_buyer_id: user.id,
  });

  if (error || !transitioned || transitioned.length === 0) {
    return err("invalid_transition", "This order isn't ready to confirm delivery.");
  }

  const hoursSinceShipped = order.shipped_at
    ? Math.round((Date.now() - new Date(order.shipped_at).getTime()) / 3_600_000)
    : 0;
  await track("order_delivered", { order_id: orderId, hours_since_shipped: hoursSinceShipped }, user.id);

  return ok(undefined);
}

/**
 * Buyer early release: `delivered` -> `released`, before the auto-release
 * window elapses (item 3 — "optional immediate release"). Not literally
 * named in PRD §11.2's own Orders action list (that table only enumerates
 * `markShipped`/`confirmDelivery`/`cancelOrder`/`raiseDispute`), but this
 * prompt's own brief explicitly asks for it and the naming follows the
 * same convention as its neighbors.
 *
 * Payout creation (§10 Epic D4 AC3/AC4) happens inside `release_order`
 * itself (Prompt 16), atomically with the state transition — never here,
 * never as a follow-up step. The cron auto-release path
 * (`api/cron/auto-release-orders`) calls the same RPC, so both paths get
 * identical payout-creation behavior for free (AC5).
 */
export async function releaseOrder(orderId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in to manage this order.");
  }

  const service = createServiceClient();
  const authResult = await authorizeOrderAction<{
    id: string;
    buyer_id: string;
    listing_id: string;
    status: string;
  }>(service, orderId, user.id, {
    actorField: "buyer_id",
    allowedStatuses: ["delivered"],
    selectColumns: "id, buyer_id, listing_id, status",
    notAuthorizedMessage: "Only the buyer can release this order.",
    invalidTransitionMessage: "This order isn't ready to be released.",
  });
  if (!authResult.ok) {
    return err(authResult.error.code, authResult.error.message);
  }

  const { data: transitioned, error } = await service.rpc("release_order", {
    p_order_id: orderId,
    p_actor_role: "buyer",
    p_actor_id: user.id,
  });

  const releasedOrder = transitioned?.[0];
  if (error || !releasedOrder) {
    return err("invalid_transition", "This order isn't ready to be released.");
  }

  await trackOrderReleased(service, releasedOrder);

  return ok(undefined);
}
