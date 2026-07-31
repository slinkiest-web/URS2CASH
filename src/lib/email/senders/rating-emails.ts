import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sendEmail } from "@/lib/email/send-email";
import { getUserEmail } from "@/lib/email/get-user-email";
import { RatingPromptEmail } from "@/lib/email/templates/rating-prompt-email";

type ServiceClient = SupabaseClient<Database>;

/**
 * §10 Epic D6 AC10: "Buyer is emailed a rating prompt on release. One
 * reminder at 72 hours if unrated." Called both from the initial-release
 * moment (`src/lib/orders/order-events.ts`, `isReminder: false`) and the
 * 72-hour cron (`isReminder: true`) — the "no further reminders" guarantee
 * is enforced by the caller (`orders.rating_reminder_sent_at`), not here.
 */
export async function sendRatingPromptEmail(
  service: ServiceClient,
  orderId: string,
  opts: { isReminder: boolean }
): Promise<void> {
  const { data: order } = await service.from("orders").select("buyer_id, seller_id, listing_id").eq("id", orderId).maybeSingle();
  if (!order) return;

  const [{ data: listing }, { data: seller }, buyerEmail] = await Promise.all([
    service.from("listings").select("title").eq("id", order.listing_id).maybeSingle(),
    service.from("profiles").select("display_name").eq("id", order.seller_id).maybeSingle(),
    getUserEmail(service, order.buyer_id),
  ]);
  if (!buyerEmail) return;

  const listingTitle = listing?.title ?? "your order";
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";

  await sendEmail({
    to: buyerEmail,
    subject: opts.isReminder ? `Reminder: rate your purchase of ${listingTitle}` : `Rate your purchase of ${listingTitle}`,
    react: RatingPromptEmail({
      listingTitle,
      sellerDisplayName: seller?.display_name ?? "the seller",
      orderUrl: `${appUrl}/orders/${orderId}`,
      isReminder: opts.isReminder,
    }),
  });
}
