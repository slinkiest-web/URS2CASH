/**
 * Server-side read queries for buyer-facing discovery (PRD §10 Epic C).
 *
 * HARD RULE (§6.2): `browsable` gates the buyer category grid and category
 * navigation ONLY. Every function in this file that is NOT explicitly for
 * the grid/nav — `getRecentlyListed`, `getCategoryListings`,
 * `searchListings` (src/lib/discovery/search.ts) — must never filter or
 * check `browsable`. Grep this file for `browsable` before touching it: it
 * should appear only in `getBrowsableCategories` and `getCategoryBySlug`'s
 * gate check.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryRegistry, type CategorySlug } from "@/lib/categories/registry";
import { getAttributeFieldDescriptors, type FieldDescriptor } from "@/lib/categories/form-fields";
import type { Database } from "@/lib/database.types";
import type { ListingCardData } from "@/components/listing/listing-card";

type Client = SupabaseClient<Database>;
type ListingRow = Database["public"]["Tables"]["listings"]["Row"];

function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(categoryRegistry, value);
}

function toCardData(
  listing: Pick<ListingRow, "id" | "title" | "price_kobo" | "condition" | "photo_urls">,
  categoryName?: string
): ListingCardData {
  return {
    id: listing.id,
    title: listing.title,
    priceKobo: listing.price_kobo,
    condition: listing.condition,
    photoUrl: listing.photo_urls[0] ?? null,
    categoryName,
  };
}

export type NavCategory = { slug: CategorySlug; displayName: string };

/**
 * PRD §10 Epic C1 AC1 / §6.2: category grid and navigation render only
 * `browsable = true` categories, ordered by `sort_order`. `sort_order`/
 * `browsable` are admin-controlled (Epic E4) and only exist on the DB row,
 * never the registry (docs/DECISIONS.md #31) — reading the registry's own
 * `browsable` field here would be reading a build-time snapshot instead of
 * the live, admin-toggleable value, which directly violates Epic E4 AC3
 * ("toggling browsable takes effect on next request, no deploy").
 */
export async function getBrowsableCategories(supabase: Client): Promise<NavCategory[]> {
  const { data } = await supabase
    .from("categories")
    .select("slug, sort_order")
    .eq("browsable", true)
    .order("sort_order", { ascending: true });

  return (data ?? [])
    .filter((row) => isCategorySlug(row.slug))
    .map((row) => ({ slug: row.slug as CategorySlug, displayName: categoryRegistry[row.slug as CategorySlug].displayName }));
}

export type CategoryPageInfo = {
  id: string;
  slug: CategorySlug;
  displayName: string;
  browsable: boolean;
};

/**
 * PRD §10 Epic C1 AC2: a category page for a `browsable = false` category
 * (or a slug that doesn't exist at all) returns 404. Callers are
 * responsible for calling `notFound()` — this just reports the gate,
 * matching HARD RULE §6.2's "for non admin users" carve-out being
 * unenforceable today (no admin-role mechanism exists yet — Known Issue
 * #12), same as every other admin-bypass gap in this codebase.
 */
export async function getCategoryBySlug(supabase: Client, slug: string): Promise<CategoryPageInfo | null> {
  if (!isCategorySlug(slug)) return null;

  const { data } = await supabase.from("categories").select("id, slug, browsable").eq("slug", slug).single();

  if (!data) return null;

  return {
    id: data.id,
    slug: slug,
    displayName: categoryRegistry[slug].displayName,
    browsable: data.browsable,
  };
}

/**
 * PRD §6.2 HARD RULE: "recently listed" is an explicitly named cross
 * category surface — `browsable` is never checked here. Every `listable`
 * category's published listings are eligible, including ones with
 * `browsable = false`, which is the entire point (a founding seller in a
 * pre-browsable category still needs a findable listing).
 */
export async function getRecentlyListed(supabase: Client, limit = 8): Promise<ListingCardData[]> {
  const { data } = await supabase
    .from("listings")
    .select("id, title, price_kobo, condition, photo_urls, category_id")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return [];

  const categoryNames = await getCategoryNames(
    supabase,
    Array.from(new Set(data.map((row) => row.category_id)))
  );

  return data.map((row) => toCardData(row, categoryNames.get(row.category_id)));
}

async function getCategoryNames(supabase: Client, categoryIds: string[]): Promise<Map<string, string>> {
  if (categoryIds.length === 0) return new Map();

  const { data } = await supabase.from("categories").select("id, slug").in("id", categoryIds);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (isCategorySlug(row.slug)) {
      map.set(row.id, categoryRegistry[row.slug].displayName);
    }
  }
  return map;
}

/**
 * Only filter types that can be expressed as JSONB *containment* on the
 * `attributes` GIN index (PRD §10 Epic C1 AC5: "attribute filters query the
 * GIN index on attributes with category_id already applied"). `enum` and
 * `boolean` fields map cleanly to `attributes @> {"field": value}`, which
 * the default `jsonb_ops` GIN index accelerates. Numeric range filters
 * (e.g. `battery_health_percent >= 80`) are deliberately out of scope here:
 * a `->>'field'` cast comparison doesn't use this index, and adding one
 * would need an index type/shape the PRD doesn't specify.
 */
export function getAttributeFilterDescriptors(slug: CategorySlug): FieldDescriptor[] {
  return getAttributeFieldDescriptors(categoryRegistry[slug].schema).filter(
    (field) => field.kind === "enum" || field.kind === "boolean"
  );
}

export type CategoryListingFilters = {
  priceMinKobo?: number;
  priceMaxKobo?: number;
  condition?: string;
  /** Keyed by attribute field name; value is the exact match to contain-filter for. */
  attributes?: Record<string, string>;
};

export type PagedListings = { items: ListingCardData[]; hasMore: boolean };

const PAGE_SIZE = 24;

/**
 * PRD §10 Epic C1 AC3/AC4/AC5: published listings within one category,
 * newest first, paginated at 24, filtered by price range and condition
 * (real columns) and category-specific attributes (JSONB containment,
 * `category_id` already applied via `.eq` before the `.contains` call so
 * Postgres can combine both index paths).
 */
export async function getCategoryListings(
  supabase: Client,
  categoryId: string,
  filters: CategoryListingFilters,
  page: number
): Promise<PagedListings> {
  const from = (page - 1) * PAGE_SIZE;
  // Fetch one extra row to know whether a next page exists without a
  // separate count query.
  const to = from + PAGE_SIZE;

  let query = supabase
    .from("listings")
    .select("id, title, price_kobo, condition, photo_urls")
    .eq("category_id", categoryId)
    .eq("status", "published");

  if (filters.priceMinKobo !== undefined) query = query.gte("price_kobo", filters.priceMinKobo);
  if (filters.priceMaxKobo !== undefined) query = query.lte("price_kobo", filters.priceMaxKobo);
  if (filters.condition) query = query.eq("condition", filters.condition);
  if (filters.attributes) {
    for (const [field, value] of Object.entries(filters.attributes)) {
      query = query.contains("attributes", { [field]: value });
    }
  }

  const { data } = await query.order("published_at", { ascending: false }).range(from, to);

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  return { items: rows.slice(0, PAGE_SIZE).map((row) => toCardData(row)), hasMore };
}
