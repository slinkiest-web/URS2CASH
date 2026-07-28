import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { categoryRegistry, type CategorySlug } from "@/lib/categories/registry";
import { ListingForm, type SellableCategory, type ExistingListing } from "./listing-form";

function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(categoryRegistry, value);
}

export default async function SellPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string }>;
}) {
  const { listing: listingId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?redirectTo=${encodeURIComponent(listingId ? `/sell?listing=${listingId}` : "/sell")}`);
  }

  // §10 Epic B1 AC1: all listable categories, ordered by sort_order.
  // sort_order/listable/browsable are admin-controlled (Epic E4), so they're
  // read from the categories table; minPhotos/maxPhotos/allowedConditions/
  // the schema itself stay registry-authoritative per §6.5.
  const { data: categoryRows } = await supabase
    .from("categories")
    .select("slug, browsable, sort_order")
    .eq("listable", true)
    .order("sort_order", { ascending: true });

  const categories: SellableCategory[] = (categoryRows ?? [])
    .filter((row) => isCategorySlug(row.slug))
    .map((row) => {
      const slug = row.slug as CategorySlug;
      const config = categoryRegistry[slug];
      return {
        slug: config.slug,
        displayName: config.displayName,
        browsable: row.browsable,
        minPhotos: config.minPhotos,
        maxPhotos: config.maxPhotos,
        allowedConditions: config.allowedConditions,
        usageIndicatorFields: config.usageIndicatorFields,
      };
    });

  // §10 Epic B1 §3.5 `listing_draft_started`'s is_first_listing property —
  // counts every listing ever created for this seller, matching
  // seller_listing_index's own counting semantics (regardless of status).
  const { count: existingListingCount } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id);

  let existingListing: ExistingListing | undefined;
  let defaultCategorySlug: CategorySlug | undefined;

  if (listingId) {
    // Resume a draft, or edit a published listing (§10 Epic B2 AC1 / B4 AC2).
    const { data: row } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .eq("seller_id", user.id)
      .single();

    if (row && (row.status === "draft" || row.status === "published")) {
      const { data: category } = await supabase
        .from("categories")
        .select("slug")
        .eq("id", row.category_id)
        .single();

      if (category && isCategorySlug(category.slug)) {
        existingListing = {
          id: row.id,
          status: row.status,
          categorySlug: category.slug,
          title: row.title,
          description: row.description,
          priceKobo: row.price_kobo,
          condition: row.condition,
          conditionNotes: row.condition_notes,
          attributes: (row.attributes as Record<string, unknown>) ?? {},
          photoUrls: row.photo_urls,
          flawPhotoIndexes: row.flaw_photo_indexes,
        };
      }
    }
  } else {
    // §10 Epic B2 AC6: a returning seller's category select defaults to
    // their most recently used category. Not applied when resuming/editing
    // a specific listing, or via "List another" (which has its own,
    // just-published-listing-based prefill, handled client-side).
    const { data: mostRecent } = await supabase
      .from("listings")
      .select("category_id")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (mostRecent) {
      const { data: category } = await supabase
        .from("categories")
        .select("slug")
        .eq("id", mostRecent.category_id)
        .single();

      if (category && isCategorySlug(category.slug)) {
        defaultCategorySlug = category.slug;
      }
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        {existingListing ? (existingListing.status === "draft" ? "Resume draft" : "Edit listing") : "Sell an item"}
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {existingListing?.status === "published"
          ? "Price, condition, and category are locked once published."
          : "Your listing goes live immediately once published."}
      </p>

      <ListingForm
        categories={categories}
        sellerId={user.id}
        isFirstListing={(existingListingCount ?? 0) === 0}
        existingListing={existingListing}
        defaultCategorySlug={defaultCategorySlug}
      />
    </main>
  );
}
