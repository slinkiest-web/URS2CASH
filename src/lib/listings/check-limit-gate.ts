/**
 * §5.4 AC0: the limit gate blocks publish (never draft creation), counting
 * only active published listings — never sold/removed/draft, never
 * aggregated ad hoc elsewhere. Shared by `createListing` (fresh publish) and
 * `updateListing` (publishing a draft) so both go through one check.
 */
import type { createClient } from "@/lib/supabase/server";
import { computeListingLimit, type ListingLimit } from "@/lib/listings/limits";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type LimitGateResult =
  | { ok: true; blocked: false }
  | { ok: true; blocked: true; limit: ListingLimit; activeCount: number }
  | { ok: false };

export async function checkListingLimitGate(
  supabase: SupabaseServerClient,
  sellerId: string
): Promise<LimitGateResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("completed_sales_count, listing_limit_override")
    .eq("id", sellerId)
    .single();

  if (!profile) {
    return { ok: false };
  }

  const { count } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("status", "published");

  const activeCount = count ?? 0;
  const limit = computeListingLimit(profile.completed_sales_count, profile.listing_limit_override);

  if (limit.cap !== null && activeCount >= limit.cap) {
    return { ok: true, blocked: true, limit, activeCount };
  }

  return { ok: true, blocked: false };
}
