/**
 * PRD §10 Epic C2 (Search). HARD RULE: search is never gated by `browsable`
 * — this file contains no reference to it, by construction. Full text search
 * runs through the `search_listings` SQL function (see
 * supabase/migrations/20260729070438_search_listings_function.sql), which
 * uses §7.1's exact tsvector index expression and is itself already scoped
 * to `status = 'published'` with no `browsable` check.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryRegistry, type CategorySlug } from "@/lib/categories/registry";
import type { Database } from "@/lib/database.types";
import type { ListingCardData } from "@/components/listing/listing-card";

type Client = SupabaseClient<Database>;

function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(categoryRegistry, value);
}

const PAGE_SIZE = 24;

export type SearchResults = { items: ListingCardData[]; hasMore: boolean };

/** PRD §10 Epic C2 AC3: results show the category name on each result. */
export async function searchListings(supabase: Client, query: string, page: number): Promise<SearchResults> {
  const trimmed = query.trim();
  if (!trimmed) return { items: [], hasMore: false };

  const offset = (page - 1) * PAGE_SIZE;

  const { data } = await supabase.rpc("search_listings", {
    search_query: trimmed,
    // One extra row, same "hasMore without a count query" pattern as
    // getCategoryListings.
    result_limit: PAGE_SIZE + 1,
    result_offset: offset,
  });

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page_rows = rows.slice(0, PAGE_SIZE);

  if (page_rows.length === 0) return { items: [], hasMore: false };

  const categoryIds = Array.from(new Set(page_rows.map((row) => row.category_id)));
  const { data: categories } = await supabase.from("categories").select("id, slug").in("id", categoryIds);

  const categoryNames = new Map<string, string>();
  for (const row of categories ?? []) {
    if (isCategorySlug(row.slug)) {
      categoryNames.set(row.id, categoryRegistry[row.slug].displayName);
    }
  }

  return {
    items: page_rows.map((row) => ({
      id: row.id,
      title: row.title,
      priceKobo: row.price_kobo,
      condition: row.condition,
      photoUrl: row.photo_urls[0] ?? null,
      categoryName: categoryNames.get(row.category_id),
    })),
    hasMore,
  };
}
