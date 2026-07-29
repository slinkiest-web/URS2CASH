"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkoutInputSchema, type CheckoutInput } from "@/lib/orders/checkout-schema";
import { computeCommission } from "@/lib/money";
import { initializeTransaction } from "@/lib/paystack";
import { track } from "@/lib/analytics/events";
import { ok, err, type Result } from "@/lib/result";

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
  track("checkout_started", { listing_id: listing.id, price_kobo: amountKobo });

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
