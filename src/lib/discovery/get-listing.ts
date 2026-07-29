/**
 * Server-side read query for listing detail (PRD §10 Epic C3).
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { categoryRegistry, type CategorySlug } from "@/lib/categories/registry";
import type { ConditionValue } from "@/lib/categories/shared";

function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(categoryRegistry, value);
}

export type ListingDetail = {
  id: string;
  title: string;
  description: string;
  priceKobo: number;
  condition: ConditionValue;
  conditionNotes: string | null;
  photoUrls: string[];
  flawPhotoIndexes: number[];
  status: string;
  sellerId: string;
  publishedAt: string | null;
  categorySlug: CategorySlug;
  categoryName: string;
  /**
   * Category `attributes`, with every registry-declared admin-only field
   * (§7.1/§9.1 — e.g. Gadgets' `imei_last_6`) already stripped at the data
   * layer, not just skipped at render time — this is what keeps it out of
   * the RSC payload entirely, not only out of the visible HTML.
   */
  attributes: Record<string, unknown>;
};

/**
 * PRD §10 Epic C3 AC1: reachable regardless of the category's `browsable`
 * state — no `browsable` check exists here, deliberately (grep this file
 * for "browsable" before touching it: it must never appear, same
 * discipline as src/lib/discovery/queries.ts). AC6: a `sold` listing must
 * still resolve so it can render as sold rather than 404 — RLS was widened
 * to allow it in 20260729080500_listings_select_sold.sql. Any other status
 * (draft/removed/suspended) 404s because RLS returns no row for it.
 *
 * Wrapped in React's `cache()`, keyed only by `id` (not a Supabase client
 * instance, which would defeat memoization by argument identity), so
 * `generateMetadata` and the page component share one database round trip
 * per request instead of two.
 */
export const getListingDetail = cache(async (id: string): Promise<ListingDetail | null> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from("listings")
    .select(
      "id, title, description, price_kobo, condition, condition_notes, photo_urls, flaw_photo_indexes, status, seller_id, published_at, attributes, category_id"
    )
    .eq("id", id)
    .single();

  if (!data) return null;

  const { data: category } = await supabase.from("categories").select("slug, name").eq("id", data.category_id).single();

  if (!category || !isCategorySlug(category.slug)) return null;

  const categorySlug = category.slug;
  const adminOnlyFields = categoryRegistry[categorySlug].adminOnlyAttributeFields;
  const attributes = { ...(data.attributes as Record<string, unknown>) };
  for (const field of adminOnlyFields) {
    delete attributes[field];
  }

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    priceKobo: data.price_kobo,
    condition: data.condition as ConditionValue,
    conditionNotes: data.condition_notes,
    photoUrls: data.photo_urls,
    flawPhotoIndexes: data.flaw_photo_indexes,
    status: data.status,
    sellerId: data.seller_id,
    publishedAt: data.published_at,
    categorySlug,
    categoryName: categoryRegistry[categorySlug].displayName,
    attributes,
  };
});
