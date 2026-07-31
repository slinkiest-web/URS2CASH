import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sendEmail } from "@/lib/email/send-email";
import { getUserEmail } from "@/lib/email/get-user-email";
import { formatKobo } from "@/lib/money";
import { OrderPaidBuyerEmail } from "@/lib/email/templates/order-paid-buyer-email";
import { OrderPaidSellerEmail } from "@/lib/email/templates/order-paid-seller-email";
import { OrderShippedEmail } from "@/lib/email/templates/order-shipped-email";
import { OrderReleasedEmail } from "@/lib/email/templates/order-released-email";

type ServiceClient = SupabaseClient<Database>;

/**
 * §10 Epic D2 AC6: "Emails to buyer and seller within 10 seconds." §9.1
 * HARD RULE: contact/fulfilment details appear in an email ONLY here — the
 * one moment they're allowed to exist anywhere outside the database at
 * all. Reads directly from the base `orders` table (not
 * `orders_participant_view`) since this runs with service-role access
 * immediately after `mark_order_paid` committed, not through either
 * party's own RLS-scoped session — the view's own privacy nulling exists
 * for a different purpose (hiding delivery details from the seller
 * pre-`paid`), which doesn't apply here.
 */
export async function sendOrderPaidEmails(service: ServiceClient, orderId: string): Promise<void> {
  const { data: order } = await service
    .from("orders")
    .select("buyer_id, seller_id, amount_kobo, seller_payout_kobo, delivery_name, delivery_phone, delivery_address, delivery_state, listing_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;

  const [{ data: listing }, { data: seller }, buyerEmail, sellerEmail] = await Promise.all([
    service.from("listings").select("title").eq("id", order.listing_id).maybeSingle(),
    service.from("profiles").select("display_name, phone").eq("id", order.seller_id).maybeSingle(),
    getUserEmail(service, order.buyer_id),
    getUserEmail(service, order.seller_id),
  ]);

  const listingTitle = listing?.title ?? "your order";

  if (buyerEmail) {
    await sendEmail({
      to: buyerEmail,
      subject: `Payment confirmed — ${listingTitle}`,
      react: OrderPaidBuyerEmail({
        listingTitle,
        amountFormatted: formatKobo(order.amount_kobo),
        sellerDisplayName: seller?.display_name ?? "the seller",
        sellerPhone: seller?.phone ?? null,
      }),
    });
  }

  if (sellerEmail) {
    await sendEmail({
      to: sellerEmail,
      subject: `Item sold — ${listingTitle}`,
      react: OrderPaidSellerEmail({
        listingTitle,
        payoutFormatted: formatKobo(order.seller_payout_kobo),
        buyerName: order.delivery_name,
        buyerPhone: order.delivery_phone,
        buyerAddress: order.delivery_address,
        buyerState: order.delivery_state,
      }),
    });
  }
}

/** §10 Epic D3 AC5: "Buyer notified by email on ship." */
export async function sendOrderShippedEmail(service: ServiceClient, orderId: string): Promise<void> {
  const { data: order } = await service
    .from("orders")
    .select("buyer_id, listing_id, tracking_note, auto_release_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;

  const [{ data: listing }, buyerEmail] = await Promise.all([
    service.from("listings").select("title").eq("id", order.listing_id).maybeSingle(),
    getUserEmail(service, order.buyer_id),
  ]);
  if (!buyerEmail) return;

  const listingTitle = listing?.title ?? "your order";
  const autoReleaseDateFormatted = order.auto_release_at
    ? new Date(order.auto_release_at).toLocaleDateString("en-NG", { dateStyle: "medium" })
    : "the auto-release date";

  await sendEmail({
    to: buyerEmail,
    subject: `Shipped — ${listingTitle}`,
    react: OrderShippedEmail({
      listingTitle,
      trackingNote: order.tracking_note ?? "No tracking note provided.",
      autoReleaseDateFormatted,
    }),
  });
}

/** §10 Epic D4 AC7: "Seller notified on release." */
export async function sendOrderReleasedEmail(service: ServiceClient, orderId: string): Promise<void> {
  const { data: order } = await service
    .from("orders")
    .select("seller_id, listing_id, seller_payout_kobo")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;

  const [{ data: listing }, sellerEmail] = await Promise.all([
    service.from("listings").select("title").eq("id", order.listing_id).maybeSingle(),
    getUserEmail(service, order.seller_id),
  ]);
  if (!sellerEmail) return;

  const listingTitle = listing?.title ?? "your listing";

  await sendEmail({
    to: sellerEmail,
    subject: `Funds queued — ${listingTitle}`,
    react: OrderReleasedEmail({ listingTitle, payoutFormatted: formatKobo(order.seller_payout_kobo) }),
  });
}
