import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  const allAttributeFilterDescriptors = getAttributeFilterDescriptors(category.slug);
  // product_group/product_subtype/gender get dedicated tab/pill UI below,
  // never the generic dropdown list — filtered out by name, not category
  // slug, so any future category with these field names gets the same
  // treatment for free (§12.3).
  const SPECIAL_FILTER_NAMES = new Set(["product_group", "product_subtype", "gender"]);
  const attributeFilterDescriptors = allAttributeFilterDescriptors.filter((f) => !SPECIAL_FILTER_NAMES.has(f.name));

  const priceMinNaira = first(resolvedSearchParams["price_min"]);
  const priceMaxNaira = first(resolvedSearchParams["price_max"]);
  const condition = first(resolvedSearchParams["condition"]);
  const page = Math.max(1, Number(first(resolvedSearchParams["page"])) || 1);

  const attributeFilters: Record<string, string> = {};
  for (const field of allAttributeFilterDescriptors) {
    const value = first(resolvedSearchParams[`attr_${field.name}`]);
    if (value) attributeFilters[field.name] = value;
  }

  const subcategoryGroups = categoryConfig.subcategoryGroups;
  const selectedGroup = attributeFilters["product_group"];
  const selectedSubtype = attributeFilters["product_subtype"];
  const genderDescriptor = allAttributeFilterDescriptors.find((f) => f.name === "gender");
  const selectedGender = attributeFilters["gender"];

  const filters: CategoryListingFilters = {
    priceMinKobo: priceMinNaira ? nairaToKobo(Number(priceMinNaira)) : undefined,
    priceMaxKobo: priceMaxNaira ? nairaToKobo(Number(priceMaxNaira)) : undefined,
    condition: condition && categoryConfig.allowedConditions.includes(condition as never) ? condition : undefined,
    attributes: attributeFilters,
  };

  const { items, hasMore } = await getCategoryListings(supabase, category.id, filters, page);

  return (
    <main className="flex flex-1 flex-col bg-u2c-canvas">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-12">
        <h1 className="font-display text-2xl font-medium text-u2c-ink">{category.displayName}</h1>

        {/* Group tabs (ASOS-style "Shop All" + each subcategory group).
            Registry-driven via subcategoryGroups — present for Beauty and
            Fashion today, any future category with the same shape gets this
            for free (§12.3). Selecting a new group clears any stale
            subtype from the previous group. */}
        {subcategoryGroups ? (
          <nav className="flex flex-wrap gap-2 border-b border-u2c-line pb-4">
            <a
              href={buildHref(slug, resolvedSearchParams, { attr_product_group: undefined, attr_product_subtype: undefined })}
              className={`rounded-full px-4 py-1.5 text-[13px] font-bold uppercase tracking-[0.03em] transition-colors duration-150 ${
                !selectedGroup ? "bg-u2c-ink text-white" : "bg-u2c-tile text-u2c-ink hover:bg-u2c-line"
              }`}
            >
              Shop All
            </a>
            {Object.entries(subcategoryGroups).map(([key, group]) => (
              <a
                key={key}
                href={buildHref(slug, resolvedSearchParams, { attr_product_group: key, attr_product_subtype: undefined })}
                className={`rounded-full px-4 py-1.5 text-[13px] font-bold uppercase tracking-[0.03em] transition-colors duration-150 ${
                  selectedGroup === key ? "bg-u2c-ink text-white" : "bg-u2c-tile text-u2c-ink hover:bg-u2c-line"
                }`}
              >
                {group.label}
              </a>
            ))}
          </nav>
        ) : null}

        {/* Subtype pills — only once a group with subtypes is selected. */}
        {subcategoryGroups && selectedGroup && Object.keys(subcategoryGroups[selectedGroup]?.subtypes ?? {}).length > 0 ? (
          <nav className="-mt-4 flex flex-wrap gap-2">
            <a
              href={buildHref(slug, resolvedSearchParams, { attr_product_subtype: undefined })}
              className={`rounded-[var(--u2c-radius-control)] border px-3 py-1 text-[13px] transition-colors duration-150 ${
                !selectedSubtype ? "border-u2c-ink text-u2c-ink" : "border-u2c-line text-u2c-ink-soft hover:border-u2c-ink"
              }`}
            >
              All {subcategoryGroups[selectedGroup]?.label}
            </a>
            {Object.entries(subcategoryGroups[selectedGroup]?.subtypes ?? {}).map(([key, label]) => (
              <a
                key={key}
                href={buildHref(slug, resolvedSearchParams, { attr_product_subtype: key })}
                className={`rounded-[var(--u2c-radius-control)] border px-3 py-1 text-[13px] transition-colors duration-150 ${
                  selectedSubtype === key ? "border-u2c-ink text-u2c-ink" : "border-u2c-line text-u2c-ink-soft hover:border-u2c-ink"
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
        ) : null}

        {/* Gender filter — Men/Women, exact-match only (never leaks a
            womens-tagged listing into a "Men" filter or vice versa;
            unisex/kids items show under "All" only, not under either). */}
        {genderDescriptor ? (
          <nav className="flex gap-2">
            {[
              { key: undefined, label: "All" },
              { key: "womens", label: "Women" },
              { key: "mens", label: "Men" },
            ].map((option) => (
              <a
                key={option.label}
                href={buildHref(slug, resolvedSearchParams, { attr_gender: option.key })}
                className={`rounded-[var(--u2c-radius-control)] px-4 py-1.5 text-[13px] font-semibold transition-colors duration-150 ${
                  (selectedGender ?? undefined) === option.key
                    ? "bg-u2c-primary text-white"
                    : "border border-u2c-line text-u2c-ink hover:border-u2c-ink"
                }`}
              >
                {option.label}
              </a>
            ))}
          </nav>
        ) : null}

        {/* GET form: filter state lives entirely in the URL query string, so
            every combination is a shareable, bookmarkable link, and the page
            stays a pure Server Component (no client JS required to filter). */}
        <form
          method="GET"
          className="flex flex-wrap items-end gap-4 rounded-[var(--u2c-radius-card)] border border-u2c-line bg-u2c-surface p-4"
        >
          <label className="flex flex-col gap-1 text-[13px] text-u2c-ink-soft">
            Min price (₦)
            <input
              type="number"
              name="price_min"
              min={0}
              defaultValue={priceMinNaira}
              className="w-28 rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-canvas px-2 py-1 text-[15px] text-u2c-ink outline-none focus:border-u2c-focus"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-u2c-ink-soft">
            Max price (₦)
            <input
              type="number"
              name="price_max"
              min={0}
              defaultValue={priceMaxNaira}
              className="w-28 rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-canvas px-2 py-1 text-[15px] text-u2c-ink outline-none focus:border-u2c-focus"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-u2c-ink-soft">
            Condition
            <select
              name="condition"
              defaultValue={condition ?? ""}
              className="w-40 rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-canvas px-2 py-1 text-[15px] text-u2c-ink outline-none focus:border-u2c-focus"
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
            <label key={field.name} className="flex flex-col gap-1 text-[13px] capitalize text-u2c-ink-soft">
              {field.name.replace(/_/g, " ")}
              <select
                name={`attr_${field.name}`}
                defaultValue={attributeFilters[field.name] ?? ""}
                className="w-40 rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-canvas px-2 py-1 text-[15px] text-u2c-ink outline-none focus:border-u2c-focus"
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
            className="h-9 rounded-[var(--u2c-radius-control)] bg-u2c-primary px-4 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-u2c-primary-press"
          >
            Apply filters
          </button>
        </form>

        {items.length > 0 ? (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
            {items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <p className="text-[15px] text-u2c-ink-soft">No listings match these filters yet.</p>
        )}

        <div className="flex items-center justify-between text-[15px] text-u2c-ink">
          {page > 1 ? (
            <a
              href={buildHref(slug, resolvedSearchParams, { page: String(page - 1) })}
              className="inline-flex items-center gap-1 hover:text-u2c-primary"
            >
              <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
              Previous
            </a>
          ) : (
            <span />
          )}
          {hasMore ? (
            <a
              href={buildHref(slug, resolvedSearchParams, { page: String(page + 1) })}
              className="inline-flex items-center gap-1 hover:text-u2c-primary"
            >
              Next
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </main>
  );
}

