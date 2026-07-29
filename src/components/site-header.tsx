import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBrowsableCategories } from "@/lib/discovery/queries";

/**
 * Server Component — no client interactivity needed for nav links or a
 * GET-method search form.
 *
 * PRD §6.2 HARD RULE: category navigation shows only `browsable = true`
 * categories. §10 Epic C2 HARD RULE: the search form itself must never
 * filter by `browsable` — it just submits `q` to `/search`, which reads
 * from `searchListings` (src/lib/discovery/search.ts), a function that has
 * no `browsable` concept at all.
 */
export async function SiteHeader() {
  const supabase = await createClient();
  const categories = await getBrowsableCategories(supabase);

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Urs2Cash
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/c/${category.slug}`}
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                {category.displayName}
              </Link>
            ))}
          </nav>
        </div>
        <form action="/search" method="GET" className="flex w-full max-w-sm items-center gap-2">
          <input
            type="search"
            name="q"
            placeholder="Search listings"
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            Search
          </button>
        </form>
      </div>
    </header>
  );
}
