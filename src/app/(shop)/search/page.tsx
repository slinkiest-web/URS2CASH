import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { searchListings } from "@/lib/discovery/search";
import { ListingCard } from "@/components/listing/listing-card";

/**
 * Server Component (PRD §5.3). PRD §10 Epic C2 HARD RULE: "search is never
 * gated by browsable" — AC1 fails if any `browsable` check exists in the
 * search path. There is none here, and none in `searchListings` — grep
 * both files for "browsable" to confirm before touching either.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();
  const { items, hasMore } = query ? await searchListings(supabase, query, page) : { items: [], hasMore: false };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {query ? `Search results for "${query}"` : "Search"}
      </h1>

      {!query ? (
        // §10 Epic C2 AC4: empty state offers a clear next action, never a
        // dead end.
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Enter a search term above to find listings across every category.
        </p>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <p>No listings matched &quot;{query}&quot;.</p>
          <p>
            Try a different term, or{" "}
            <Link href="/" className="underline">
              browse categories
            </Link>{" "}
            instead.
          </p>
        </div>
      )}

      {query && (page > 1 || hasMore) ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <a href={`/search?q=${encodeURIComponent(query)}&page=${page - 1}`} className="underline">
              Previous
            </a>
          ) : (
            <span />
          )}
          {hasMore ? (
            <a href={`/search?q=${encodeURIComponent(query)}&page=${page + 1}`} className="underline">
              Next
            </a>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
