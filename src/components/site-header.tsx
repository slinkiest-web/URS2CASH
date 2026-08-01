import Link from "next/link";
import { Search } from "lucide-react";
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
 * users get Sell, My listings, Account (-> /dashboard/profile), and Sign
 * out. This is purely a discoverability affordance — every protected route
 * these links lead to (§middleware.ts PROTECTED_PREFIXES) already
 * re-checks the session itself.
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
    <header className="border-b border-u2c-line bg-u2c-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-display text-xl font-medium text-u2c-ink">
            Urs2Cash
          </Link>
          <nav className="flex items-center gap-4 text-[15px] text-u2c-ink-soft">
            {categories.map((category) => (
              <Link key={category.slug} href={`/c/${category.slug}`} className="hover:text-u2c-ink">
                {category.displayName}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <form action="/search" method="GET" className="relative w-full max-w-sm">
            <Search
              size={16}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-u2c-ink-soft"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              placeholder="Search listings"
              className="w-full rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-canvas py-1.5 pl-9 pr-3 text-[15px] text-u2c-ink outline-none placeholder:text-u2c-ink-soft focus:border-u2c-focus focus:ring-2 focus:ring-u2c-focus/20"
            />
          </form>
          <nav className="flex items-center gap-4 text-[15px] text-u2c-ink-soft">
            {isAdmin ? (
              <Link href="/admin" className="font-medium hover:text-u2c-ink">
                Admin
              </Link>
            ) : null}
            {user ? (
              <>
                <Link
                  href="/sell"
                  className="rounded-[var(--u2c-radius-control)] bg-u2c-primary px-3 py-1.5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-u2c-primary-press"
                >
                  Sell
                </Link>
                <Link href="/dashboard/listings" className="hover:text-u2c-ink">
                  My listings
                </Link>
                <Link href="/dashboard/profile" className="hover:text-u2c-ink">
                  Account
                </Link>
                <form action={signOutAction}>
                  <button type="submit" className="hover:text-u2c-ink">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/sign-in" className="hover:text-u2c-ink">
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-[var(--u2c-radius-control)] bg-u2c-ink px-3 py-1.5 text-[15px] font-medium text-white hover:bg-u2c-primary"
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
