/**
 * Seller reputation read query (PRD §10 Epic C3 AC5/AC5b, §9.2 Job 3).
 *
 * Shared by listing detail (Prompt 11) and the seller public profile page
 * (Epic C4, Prompt 12 per C3 AC3 / C4 AC3) — one query, one component
 * (src/components/reputation/seller-reputation-block.tsx), never
 * duplicated per surface.
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type SellerReview = {
  id: string;
  score: number;
  review: string;
  createdAt: string;
};

export type SellerReputation = {
  sellerId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  memberSince: string;
  completedSalesCount: number;
  /** Meaningful only when `ratingCount >= 3` — PRD §9.2 HARD RULE. Callers must gate on `ratingCount`, never render this value unconditionally. */
  ratingAverage: number | null;
  ratingCount: number;
  /** Meaningful only when `completedSalesCount >= 5` — PRD §9.2 HARD RULE. */
  disputeUpheldCount: number;
  recentReviews: SellerReview[];
};

const RECENT_REVIEWS_LIMIT = 3;

/**
 * Returns null when the seller has no public profile (suspended, or the id
 * doesn't exist) — `profiles_public` (docs/DECISIONS.md #1) already filters
 * suspended rows out at the view level, so a null result here reads as
 * "seller not found," not as an error to surface differently.
 */
export const getSellerReputation = cache(async (sellerId: string): Promise<SellerReputation | null> => {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles_public")
    .select(
      "id, display_name, handle, avatar_url, completed_sales_count, rating_average, rating_count, dispute_upheld_count, created_at"
    )
    .eq("id", sellerId)
    .single();

  if (!profile || !profile.id || !profile.display_name || !profile.handle || !profile.created_at) return null;

  // §7.2 "Public read where is_hidden = false" — the review-text half of
  // that rule. Score is public even when hidden (docs/DECISIONS.md #24),
  // but a hidden or review-less rating isn't a "review" to display here.
  const { data: reviews } = await supabase
    .from("ratings_public")
    .select("id, score, review, created_at")
    .eq("seller_id", sellerId)
    .eq("is_hidden", false)
    .not("review", "is", null)
    .order("created_at", { ascending: false })
    .limit(RECENT_REVIEWS_LIMIT);

  const recentReviews: SellerReview[] = (reviews ?? [])
    .filter(
      (r): r is typeof r & { id: string; score: number; review: string; created_at: string } =>
        r.id !== null && r.score !== null && r.review !== null && r.created_at !== null
    )
    .map((r) => ({ id: r.id, score: r.score, review: r.review, createdAt: r.created_at }));

  return {
    sellerId: profile.id,
    displayName: profile.display_name,
    handle: profile.handle,
    avatarUrl: profile.avatar_url,
    memberSince: profile.created_at,
    completedSalesCount: profile.completed_sales_count ?? 0,
    ratingAverage: profile.rating_average,
    ratingCount: profile.rating_count ?? 0,
    disputeUpheldCount: profile.dispute_upheld_count ?? 0,
    recentReviews,
  };
});
