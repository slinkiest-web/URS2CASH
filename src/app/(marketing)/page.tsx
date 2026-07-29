import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBrowsableCategories, getRecentlyListed } from "@/lib/discovery/queries";
import { ListingCard } from "@/components/listing/listing-card";

/**
 * Server Component (PRD §5.3: "Browse ... server rendered, cached at the
 * edge") — no client-side data fetching, first paint carries real content.
 */
export default async function HomePage() {
  const supabase = await createClient();

  // §6.2 HARD RULE: the category grid shows only `browsable = true`
  // categories. §6.2's other HARD RULE, just as load-bearing: "recently
  // listed" is an explicitly named cross-category surface — `browsable` is
  // never checked for it, so a Fashion/Gadgets/etc. seller's listing is
  // just as visible here as a Beauty one.
  const [categories, recentlyListed] = await Promise.all([
    getBrowsableCategories(supabase),
    getRecentlyListed(supabase, 8),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-6 py-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Browse categories</h1>
        {categories.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/c/${category.slug}`}
                className="flex items-center justify-center rounded-lg border border-zinc-200 px-4 py-8 text-center text-sm font-medium transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                {category.displayName}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No categories open for browsing yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Recently listed</h2>
        {recentlyListed.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {recentlyListed.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No listings yet — be the first to sell.</p>
        )}
      </section>
    </main>
  );
}
