/**
 * Shared event-firing helpers used by both the buyer-facing release action
 * and the cron-driven auto-release path (src/lib/actions/orders.ts and
 * src/app/api/cron/auto-release-orders/route.ts) — the computation is
 * identical regardless of which actor triggered the release, so it lives
 * once here rather than duplicated at both call sites. Deliberately not in
 * src/lib/actions/orders.ts itself: that file has "use server", and every
 * export from a "use server" file becomes a callable server-action
 * reference — this is a plain internal helper, not an action.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { track } from "@/lib/analytics/track-server";
import { sendOrderReleasedEmail } from "@/lib/email/senders/order-emails";
import { sendRatingPromptEmail } from "@/lib/email/senders/rating-emails";

type ServiceClient = SupabaseClient<Database>;

/**
 * §10 Epic D4 AC6: order_released fires with days_listing_to_sale, computed
 * from listings.published_at. Shared by all three paths that can reach
 * `released` — buyer early release, the auto-release cron, and admin
 * dispute-resolution-for-seller — so each gets identical event (and, from
 * this prompt, email) behavior for free, never duplicated per call site.
 *
 * distinctId is the seller, not whichever actor (buyer/system/admin)
 * triggered the transition: `order_released`'s own §3.5 description is
 * state-focused ("Order reaches released"), not actor-focused, and its
 * business meaning — funds now queued for payout — is the seller's
 * outcome regardless of who got the order there.
 *
 * §10 Epic D4 AC7 ("seller notified on release") and §10 Epic D6 AC10
 * ("buyer emailed a rating prompt on release") are the same trigger
 * moment, two different recipients — both sent from here so every release
 * path (buyer early release, the auto-release cron, and admin
 * dispute-resolution-for-seller) gets both emails identically, never
 * duplicated per call site.
 */
export async function trackOrderReleased(
  service: ServiceClient,
  order: { id: string; listing_id: string; seller_id: string; buyer_id: string; released_at: string | null }
): Promise<void> {
  const { data: listing } = await service
    .from("listings")
    .select("published_at")
    .eq("id", order.listing_id)
    .maybeSingle();

  const publishedAtMs = listing?.published_at ? new Date(listing.published_at).getTime() : null;
  const releasedAtMs = order.released_at ? new Date(order.released_at).getTime() : Date.now();
  const daysListingToSale = publishedAtMs !== null ? Math.round((releasedAtMs - publishedAtMs) / 86_400_000) : 0;

  await track("order_released", { order_id: order.id, days_listing_to_sale: daysListingToSale }, order.seller_id);

  await sendOrderReleasedEmail(service, order.id);
  await sendRatingPromptEmail(service, order.id, { isReminder: false });
}
