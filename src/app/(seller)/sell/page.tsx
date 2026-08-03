import { redirect } from "next/navigation";
import Image from "next/image";
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
        subcategoryGroups: config.subcategoryGroups,
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
          reasonForSelling: row.reason_for_selling,
          timesUsed: row.times_used,
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

  const isNewListing = !existingListing;

  return (
    <main className="flex flex-1 flex-col bg-u2c-canvas">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:flex-row lg:items-start lg:gap-12 lg:px-12">
        <div className="flex flex-col gap-6 lg:w-2/5 lg:shrink-0">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-u2c-ink sm:text-4xl">
              {existingListing
                ? existingListing.status === "draft"
                  ? "Resume draft"
                  : "Edit listing"
                : "Sell an item"}
            </h1>
            <p className="mt-2 text-[15px] text-u2c-ink-soft">
              {existingListing?.status === "published"
                ? "Price, condition, and category are locked once published."
                : "A title, a price, a category, a condition, and one photo. That's it, it's live in a couple of minutes."}
            </p>
          </div>

          {isNewListing ? (
            <div className="relative hidden aspect-[4/5] w-full overflow-hidden rounded-[var(--u2c-radius-card)] bg-u2c-tile sm:block">
              <Image
                src="/images/marketing/fashion-sell.jpg"
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
                priority
              />
            </div>
          ) : null}
        </div>

        <div className="flex-1">
          <ListingForm
            categories={categories}
            sellerId={user.id}
            isFirstListing={(existingListingCount ?? 0) === 0}
            existingListing={existingListing}
            defaultCategorySlug={defaultCategorySlug}
          />
        </div>
      </div>
    </main>
  );
}
