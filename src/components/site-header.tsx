import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBrowsableCategories } from "@/lib/discovery/queries";
import { signOutAction } from "@/lib/actions/auth";

/**
 * Server Component — no client interactivity needed for nav links, the
 * sign-out form, or a GET-method search form.
 *
 * PRD §6.2 HARD RULE: category navigation shows only `browsable = true`
 * categories. §10 Epic C2 HARD RULE: the search form itself must never
 * filter by `browsable` — it just submits `q` to `/search`, which reads
 * from `searchListings` (src/lib/discovery/search.ts), a function that has
 * no `browsable` concept at all.
 *
 * Auth entry points: signed-out visitors get Sign in / Sign up; signed-in
 * users get Account (-> /dashboard/profile) and Sign out. This is purely a
 * discoverability affordance — every protected route these links lead to
 * (§middleware.ts PROTECTED_PREFIXES) already re-checks the session itself.
 *
 * Admin entry point: the Admin link only renders for a signed-in user whose
 * own `profiles.is_admin` row is true, read via the caller's own RLS-scoped
 * session — the identical check middleware.ts already runs to decide
 * whether /admin 404s (Epic E5 AC1). Showing this link is a convenience for
 * a real operator only; it changes nothing about the security boundary,
 * since every admin server action still re-verifies `is_admin` from the
 * database via the service-role client (requireAdmin(), §11.2 HARD RULE) on
 * every call, and /admin still 404s outright for anyone this check misses.
 */
export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    isAdmin = profile?.is_admin === true;
  }

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
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
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
          <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            {isAdmin ? (
              <Link href="/admin" className="font-medium hover:text-zinc-900 dark:hover:text-zinc-50">
                Admin
              </Link>
            ) : null}
            {user ? (
              <>
                <Link
                  href="/sell"
                  className="rounded-md bg-u2c-action px-3 py-1.5 text-sm font-semibold text-white hover:bg-u2c-action-press"
                >
                  Sell
                </Link>
                <Link href="/dashboard/profile" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                  Account
                </Link>
                <form action={signOutAction}>
                  <button type="submit" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/sign-in" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
