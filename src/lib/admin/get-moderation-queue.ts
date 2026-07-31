import { createServiceClient } from "@/lib/supabase/service";

export type OpenModerationFlag = {
  id: string;
  reason: string;
  patternType: string | null;
  matchedText: string | null;
  source: string;
  createdAt: string;
  listingId: string;
  listingTitle: string;
  listingStatus: string;
  listingPhotoUrl: string | null;
  sellerId: string;
  sellerHandle: string | null;
  sellerDisplayName: string | null;
};

/**
 * PRD §10 Epic E1 AC1: "Lists open moderation_flags newest first with the
 * listing preview inline." This is the queue's primary view — §9.3 point 3
 * ("raised to the top of the moderation queue") is satisfied by this being
 * the *only* thing shown here, ahead of the unflagged recent-listings browse
 * below (Decision from Prompt 19, mirroring #40's "newest-first is the
 * whole mechanism, no priority column needed").
 *
 * `moderation_flags` has zero RLS policies for anon/authenticated (§7.2:
 * "Admin only") — every read here goes through the service-role client,
 * same as every other admin query in this file.
 */
export async function getOpenModerationFlags(): Promise<OpenModerationFlag[]> {
  const service = createServiceClient();

  const { data: flags } = await service
    .from("moderation_flags")
    .select("id, reason, pattern_type, matched_text, source, created_at, listing_id")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (!flags || flags.length === 0) return [];

  const listingIds = [...new Set(flags.map((f) => f.listing_id))];
  const { data: listings } = await service
    .from("listings")
    .select("id, title, status, photo_urls, seller_id")
    .in("id", listingIds);

  const listingById = new Map((listings ?? []).map((l) => [l.id, l]));

  const sellerIds = [...new Set((listings ?? []).map((l) => l.seller_id))];
  const { data: sellers } = sellerIds.length
    ? await service.from("profiles").select("id, handle, display_name").in("id", sellerIds)
    : { data: [] };
  const sellerById = new Map((sellers ?? []).map((s) => [s.id, s]));

  return flags.map((flag) => {
    const listing = listingById.get(flag.listing_id);
    const seller = listing ? sellerById.get(listing.seller_id) : undefined;
    return {
      id: flag.id,
      reason: flag.reason,
      patternType: flag.pattern_type,
      matchedText: flag.matched_text,
      source: flag.source,
      createdAt: flag.created_at,
      listingId: flag.listing_id,
      listingTitle: listing?.title ?? "(listing not found)",
      listingStatus: listing?.status ?? "unknown",
      listingPhotoUrl: listing?.photo_urls?.[0] ?? null,
      sellerId: listing?.seller_id ?? "",
      sellerHandle: seller?.handle ?? null,
      sellerDisplayName: seller?.display_name ?? null,
    };
  });
}

export type RecentListing = {
  id: string;
  title: string;
  status: string;
  photoUrl: string | null;
  priceKobo: number;
  publishedAt: string | null;
  createdAt: string;
  sellerId: string;
  sellerHandle: string | null;
};

/**
 * §10 Epic E1 AC4: "Admin may suspend any listing directly, whether or not
 * flagged" — the flags list above only ever shows listings someone/something
 * already flagged, so this is the browse surface that makes an unflagged
 * listing reachable at all. Newest first, published/sold/suspended only
 * (never draft/removed — nothing an admin would act on there).
 */
export async function getRecentListings(limit = 50): Promise<RecentListing[]> {
  const service = createServiceClient();

  const { data: listings } = await service
    .from("listings")
    .select("id, title, status, photo_urls, price_kobo, published_at, created_at, seller_id")
    .in("status", ["published", "sold", "suspended"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!listings || listings.length === 0) return [];

  const sellerIds = [...new Set(listings.map((l) => l.seller_id))];
  const { data: sellers } = await service.from("profiles").select("id, handle").in("id", sellerIds);
  const sellerById = new Map((sellers ?? []).map((s) => [s.id, s]));

  return listings.map((l) => ({
    id: l.id,
    title: l.title,
    status: l.status,
    photoUrl: l.photo_urls?.[0] ?? null,
    priceKobo: l.price_kobo,
    publishedAt: l.published_at,
    createdAt: l.created_at,
    sellerId: l.seller_id,
    sellerHandle: sellerById.get(l.seller_id)?.handle ?? null,
  }));
}
