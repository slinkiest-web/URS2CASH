import { createServiceClient } from "@/lib/supabase/service";

export type AdminReview = {
  id: string;
  orderId: string;
  score: number;
  review: string | null;
  isHidden: boolean;
  createdAt: string;
  raterDisplayName: string;
  sellerDisplayName: string;
  sellerHandle: string;
};

/**
 * Admin-side review list backing `hideReview` (§11.2). Not tied to a
 * numbered Epic E1-E4 acceptance criterion — `hideReview` exists in §11.2's
 * action table with no dedicated user story, same shape as `dismissFlag`
 * belonging to E1 without its own AC line. Reads the base `ratings` table
 * directly (it has zero SELECT policy for any role, not even the rater —
 * Decision #24), scoped to reviews with actual text, since a bare score
 * with no review has nothing for `is_hidden` to hide.
 */
export async function getRecentReviews(limit = 50): Promise<AdminReview[]> {
  const service = createServiceClient();

  const { data: ratings } = await service
    .from("ratings")
    .select("id, order_id, score, review, is_hidden, created_at, rater_id, seller_id")
    .not("review", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!ratings || ratings.length === 0) return [];

  const profileIds = [...new Set(ratings.flatMap((r) => [r.rater_id, r.seller_id]))];
  const { data: profiles } = await service.from("profiles").select("id, display_name, handle").in("id", profileIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return ratings.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    score: r.score,
    review: r.review,
    isHidden: r.is_hidden,
    createdAt: r.created_at,
    raterDisplayName: profileById.get(r.rater_id)?.display_name ?? "Buyer",
    sellerDisplayName: profileById.get(r.seller_id)?.display_name ?? "Seller",
    sellerHandle: profileById.get(r.seller_id)?.handle ?? "",
  }));
}
