import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
    <main className="flex flex-1 flex-col bg-u2c-canvas">
      <section className="border-b border-u2c-line bg-u2c-cream">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-14 sm:px-6 md:py-20 lg:px-12">
          <h1 className="font-display text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.1] text-u2c-ink">
            Sell what you no longer wear.
            <br />
            Buy what&apos;s next.
          </h1>
          <p className="max-w-md text-[15px] text-u2c-ink-soft">
            A considered marketplace for pre-owned pieces, backed by escrow protection on every order.
          </p>
          <Link
            href="/sell"
            className="mt-3 inline-flex h-11 w-fit items-center gap-2 rounded-[var(--u2c-radius-control)] bg-u2c-primary px-6 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-u2c-primary-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-u2c-focus"
          >
            Start selling
            <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-4 py-10 sm:px-6 md:gap-16 lg:px-12 lg:py-16">
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-medium text-u2c-ink">Browse categories</h2>
          {categories.length > 0 ? (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/c/${category.slug}`}
                  className="flex items-center justify-center rounded-[var(--u2c-radius-card)] border border-u2c-line bg-u2c-surface px-4 py-8 text-center text-[15px] font-medium text-u2c-ink transition-colors duration-150 hover:border-u2c-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-u2c-focus"
                >
                  {category.displayName}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[15px] text-u2c-ink-soft">No categories open for browsing yet.</p>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-medium text-u2c-ink">Recently listed</h2>
          {recentlyListed.length > 0 ? (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
              {recentlyListed.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-[var(--u2c-radius-card)] border border-u2c-line bg-u2c-surface px-6 py-12">
              <h3 className="font-display text-xl font-medium text-u2c-ink">Nothing here yet</h3>
              <p className="text-[15px] text-u2c-ink-soft">
                Be the first to list something. It takes a few minutes to publish.
              </p>
              <Link
                href="/sell"
                className="mt-1 inline-flex h-11 items-center rounded-[var(--u2c-radius-control)] bg-u2c-primary px-6 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-u2c-primary-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-u2c-focus"
              >
                Start selling
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
