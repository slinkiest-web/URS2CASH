/**
 * Paginated review history for the seller public profile (PRD §10 Epic C4).
 * `get-seller-reputation.ts`'s `recentReviews` is capped at 3 for the
 * compact reputation block shown on both listing detail and this page —
 * this is the paginated full history behind it, same filter (`is_hidden =
 * false`, `review` present — §7.2's "public read where is_hidden = false"),
 * reusing `SellerReview` rather than defining a second shape for the same
 * row.
 */
import { createClient } from "@/lib/supabase/server";
import type { SellerReview } from "@/lib/reputation/get-seller-reputation";

const PAGE_SIZE = 10;

export type PagedSellerReviews = { items: SellerReview[]; hasMore: boolean };

export async function getSellerReviews(sellerId: string, page: number): Promise<PagedSellerReviews> {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const { data } = await supabase
    .from("ratings_public")
    .select("id, score, review, created_at")
    .eq("seller_id", sellerId)
    .eq("is_hidden", false)
    .not("review", "is", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;

  const items: SellerReview[] = rows
    .slice(0, PAGE_SIZE)
    .filter(
      (r): r is typeof r & { id: string; score: number; review: string; created_at: string } =>
        r.id !== null && r.score !== null && r.review !== null && r.created_at !== null
    )
    .map((r) => ({ id: r.id, score: r.score, review: r.review, createdAt: r.created_at }));

  return { items, hasMore };
}
