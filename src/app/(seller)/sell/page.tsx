import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { categoryRegistry, type CategorySlug } from "@/lib/categories/registry";
import { ListingForm, type SellableCategory } from "./listing-form";

function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(categoryRegistry, value);
}

export default async function SellPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?redirectTo=/sell");
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

  // §3.5 `listing_draft_started`'s is_first_listing property — counts every
  // listing ever created for this seller, matching seller_listing_index's
  // own counting semantics (regardless of current status).
  const { count: existingListingCount } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sell an item</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Your listing goes live immediately once published.
      </p>

      <ListingForm
        categories={categories}
        sellerId={user.id}
        isFirstListing={(existingListingCount ?? 0) === 0}
      />
    </main>
  );
}
