import { createServiceClient } from "@/lib/supabase/service";

export type SellerAdminDetail = {
  id: string;
  handle: string;
  displayName: string;
  isSuspended: boolean;
  suspensionReason: string | null;
  listingLimitOverride: number | null;
  completedSalesCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  disputeUpheldCount: number;
  activeListingCount: number;
};

/**
 * Backs `suspendSeller`/`setListingLimitOverride` (§11.2, §5.4). Reads the
 * base `profiles` table via service role — the public `profiles_public`
 * view (Decision #1) deliberately excludes `dispute_upheld_count` and
 * `listing_limit_override`, exactly the columns this admin surface exists
 * to show and edit.
 */
export async function getSellerAdminDetailByHandle(handle: string): Promise<SellerAdminDetail | null> {
  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select(
      "id, handle, display_name, is_suspended, suspension_reason, listing_limit_override, completed_sales_count, rating_average, rating_count, dispute_upheld_count"
    )
    .eq("handle", handle.trim().toLowerCase())
    .maybeSingle();

  if (!profile) return null;

  const { count } = await service
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", profile.id)
    .eq("status", "published");

  return {
    id: profile.id,
    handle: profile.handle,
    displayName: profile.display_name,
    isSuspended: profile.is_suspended,
    suspensionReason: profile.suspension_reason,
    listingLimitOverride: profile.listing_limit_override,
    completedSalesCount: profile.completed_sales_count,
    ratingAverage: profile.rating_average,
    ratingCount: profile.rating_count,
    disputeUpheldCount: profile.dispute_upheld_count,
    activeListingCount: count ?? 0,
  };
}
