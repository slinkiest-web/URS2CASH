import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCategoryBySlug,
  getCategoryListings,
  getAttributeFilterDescriptors,
  type CategoryListingFilters,
} from "@/lib/discovery/queries";
import { categoryRegistry } from "@/lib/categories/registry";
import { ListingCard } from "@/components/listing/listing-card";
import { nairaToKobo } from "@/lib/money";

const CONDITION_LABELS: Record<string, string> = {
  brand_new: "Brand New",
  opened_unused: "Opened but Unused",
  used: "Used",
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildHref(slug: string, params: SearchParams, overrides: Record<string, string | undefined>): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = first(value);
    if (v) next.set(key, v);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return `/c/${slug}${qs ? `?${qs}` : ""}`;
}

/**
 * Server Component (PRD §5.3). PRD §10 Epic C1 AC2 / §6.2 HARD RULE: a
 * `browsable = false` category (or a slug that doesn't exist) 404s. The
 * PRD's "for non admin users" carve-out is unenforceable today — no
 * admin-role mechanism exists yet (Known Issue #12) — so this 404s
 * unconditionally, same as every other admin-bypass gap in this codebase.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const supabase = await createClient();
  const category = await getCategoryBySlug(supabase, slug);

  if (!category || !category.browsable) {
    notFound();
  }

  const categoryConfig = categoryRegistry[category.slug];
  const attributeFilterDescriptors = getAttributeFilterDescriptors(category.slug);

  const priceMinNaira = first(resolvedSearchParams["price_min"]);
  const priceMaxNaira = first(resolvedSearchParams["price_max"]);
  const condition = first(resolvedSearchParams["condition"]);
  const page = Math.max(1, Number(first(resolvedSearchParams["page"])) || 1);

  const attributeFilters: Record<string, string> = {};
  for (const field of attributeFilterDescriptors) {
    const value = first(resolvedSearchParams[`attr_${field.name}`]);
    if (value) attributeFilters[field.name] = value;
  }

  const filters: CategoryListingFilters = {
    priceMinKobo: priceMinNaira ? nairaToKobo(Number(priceMinNaira)) : undefined,
    priceMaxKobo: priceMaxNaira ? nairaToKobo(Number(priceMaxNaira)) : undefined,
    condition: condition && categoryConfig.allowedConditions.includes(condition as never) ? condition : undefined,
    attributes: attributeFilters,
  };

  const { items, hasMore } = await getCategoryListings(supabase, category.id, filters, page);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{category.displayName}</h1>

      {/* GET form: filter state lives entirely in the URL query string, so
          every combination is a shareable, bookmarkable link, and the page
          stays a pure Server Component (no client JS required to filter). */}
      <form method="GET" className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <label className="flex flex-col gap-1 text-sm">
          Min price (₦)
          <input
            type="number"
            name="price_min"
            min={0}
            defaultValue={priceMinNaira}
            className="w-28 rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Max price (₦)
          <input
            type="number"
            name="price_max"
            min={0}
            defaultValue={priceMaxNaira}
            className="w-28 rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Condition
          <select
            name="condition"
            defaultValue={condition ?? ""}
            className="w-40 rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          >
            <option value="">Any condition</option>
            {categoryConfig.allowedConditions.map((value) => (
              <option key={value} value={value}>
                {CONDITION_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </label>
        {attributeFilterDescriptors.map((field) => (
          <label key={field.name} className="flex flex-col gap-1 text-sm capitalize">
            {field.name.replace(/_/g, " ")}
            <select
              name={`attr_${field.name}`}
              defaultValue={attributeFilters[field.name] ?? ""}
              className="w-40 rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
            >
              <option value="">Any</option>
              {field.kind === "boolean"
                ? [
                    <option key="true" value="true">
                      Yes
                    </option>,
                    <option key="false" value="false">
                      No
                    </option>,
                  ]
                : field.kind === "enum"
                  ? field.options.map((option) => (
                      <option key={option} value={option}>
                        {option.replace(/_/g, " ")}
                      </option>
                    ))
                  : null}
            </select>
          </label>
        ))}
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          Apply filters
        </button>
      </form>

      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No listings match these filters yet.</p>
      )}

      <div className="flex items-center justify-between text-sm">
        {page > 1 ? (
          <a href={buildHref(slug, resolvedSearchParams, { page: String(page - 1) })} className="underline">
            Previous
          </a>
        ) : (
          <span />
        )}
        {hasMore ? (
          <a href={buildHref(slug, resolvedSearchParams, { page: String(page + 1) })} className="underline">
            Next
          </a>
        ) : null}
      </div>
    </main>
  );
}

