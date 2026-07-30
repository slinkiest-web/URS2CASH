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
import { track } from "@/lib/analytics/events";

type ServiceClient = SupabaseClient<Database>;

/** §10 Epic D4 AC6: order_released fires with days_listing_to_sale, computed from listings.published_at. */
export async function trackOrderReleased(
  service: ServiceClient,
  order: { id: string; listing_id: string; released_at: string | null }
): Promise<void> {
  const { data: listing } = await service
    .from("listings")
    .select("published_at")
    .eq("id", order.listing_id)
    .maybeSingle();

  const publishedAtMs = listing?.published_at ? new Date(listing.published_at).getTime() : null;
  const releasedAtMs = order.released_at ? new Date(order.released_at).getTime() : Date.now();
  const daysListingToSale = publishedAtMs !== null ? Math.round((releasedAtMs - publishedAtMs) / 86_400_000) : 0;

  track("order_released", { order_id: order.id, days_listing_to_sale: daysListingToSale });
}
