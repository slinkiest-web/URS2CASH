import Image from "next/image";
import Link from "next/link";
import { Search, User, Tag, List, ShieldCheck, ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBrowsableCategories, getCategoryShowcase } from "@/lib/discovery/queries";
import { isAllowedImageUrl, isPrivateIpImageUrl } from "@/lib/images/allowed-hosts";
import { CATEGORY_MARKETING_IMAGE } from "@/lib/images/marketing";
import { signOutAction } from "@/lib/actions/auth";

/**
 * Server Component — no client interactivity needed for nav links, the
 * sign-out form, or a GET-method search form.
 *
 * urs2cash-ui skill, Header spec (Revision 4): two-tier, a black main bar
 * (wordmark, search, real account-area actions only) plus a white category
 * bar. Sell is the one burgundy touch in the header, everything else in the
 * main bar stays white/ink, matching "burgundy is sparing."
 *
 * Design/UX pass Stage 3 (2026-08-04): the category bar carries a small
 * photo thumbnail per category (real listing photo, marketing fallback for
 * an empty category — src/lib/images/marketing.ts) alongside the label,
 * instead of a bare text tab — makes the row scannable and inviting rather
 * than a row of words, without the weight of a full mega menu for what is
 * currently two categories.
 *
 * PRD §6.2 HARD RULE: category navigation shows only `browsable = true`
 * categories. §10 Epic C2 HARD RULE: the search form itself must never
 * filter by `browsable` — it just submits `q` to `/search`, which reads
 * from `searchListings` (src/lib/discovery/search.ts), a function that has
 * no `browsable` concept at all.
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
  const categoryThumbs = await getCategoryShowcase(supabase, categories);

  return (
    <header>
      {/* Design/UX pass Stage 3c: a barely-there warm gradient (near-black
          toward a deep burgundy-black) replaces the flat --u2c-ink fill,
          per explicit direction to warm up the header without abandoning
          its high-contrast register — no burgundy reaches a saturated
          value anywhere in the blend. */}
      <div style={{ background: "linear-gradient(115deg, var(--u2c-ink-warm-start) 0%, var(--u2c-ink) 60%)" }}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6 lg:px-12">
          <Link href="/" className="font-display shrink-0 text-xl font-extrabold tracking-tight text-white">
            Urs2Cash
          </Link>

          <form action="/search" method="GET" className="relative flex-1">
            <Search
              size={18}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-u2c-ink-soft"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              placeholder="Search listings"
              className="h-11 w-full rounded-[var(--u2c-radius-control)] border-0 bg-white py-1.5 pl-10 pr-3 text-[15px] text-u2c-ink outline-none placeholder:text-u2c-ink-soft focus:ring-2 focus:ring-white/60"
            />
          </form>

          <nav className="flex shrink-0 items-center gap-4 text-[13px] font-bold uppercase tracking-[0.03em] text-white/80">
            {isAdmin ? (
              <Link href="/admin" className="flex items-center gap-1.5 hover:text-white">
                <ShieldCheck size={18} strokeWidth={1.75} aria-hidden />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            ) : null}
            {user ? (
              <>
                <Link
                  href="/sell"
                  className="flex h-9 items-center gap-1.5 rounded-[var(--u2c-radius-control)] bg-u2c-primary px-3 text-white transition-colors duration-150 hover:bg-u2c-primary-press"
                >
                  <Tag size={16} strokeWidth={1.75} aria-hidden />
                  Sell
                </Link>
                <Link href="/dashboard/listings" className="flex items-center gap-1.5 hover:text-white">
                  <List size={18} strokeWidth={1.75} aria-hidden />
                  <span className="hidden sm:inline">My listings</span>
                </Link>
                <Link href="/dashboard/profile" className="flex items-center gap-1.5 hover:text-white">
                  <User size={18} strokeWidth={1.75} aria-hidden />
                  <span className="hidden sm:inline">Account</span>
                </Link>
                <form action={signOutAction}>
                  <button type="submit" className="hover:text-white">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/sign-in" className="hover:text-white">
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="flex h-9 items-center rounded-[var(--u2c-radius-control)] bg-white px-3 text-u2c-ink transition-colors duration-150 hover:bg-white/90"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>

      <div className="border-b border-u2c-line bg-u2c-surface">
        <nav className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-2 py-2 sm:gap-2 sm:px-6 lg:px-12">
          {categoryThumbs.map((category) => {
            const imageSrc =
              category.photoUrl !== null && isAllowedImageUrl(category.photoUrl)
                ? category.photoUrl
                : CATEGORY_MARKETING_IMAGE[category.slug];

            return (
              <Link
                key={category.slug}
                href={`/c/${category.slug}`}
                className="group flex shrink-0 items-center gap-2 rounded-[var(--u2c-radius-control)] px-2 py-1.5 transition-colors duration-150 hover:bg-u2c-tile focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-u2c-focus"
              >
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-u2c-tile">
                  {imageSrc ? (
                    <Image
                      src={imageSrc}
                      alt=""
                      fill
                      unoptimized={isPrivateIpImageUrl(imageSrc)}
                      sizes="36px"
                      className="object-cover transition-transform duration-[220ms] ease-out group-hover:scale-[1.06] motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <ImageOff size={14} strokeWidth={1.5} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-u2c-ink-soft opacity-40" aria-hidden />
                  )}
                </span>
                <span className="border-b-2 border-transparent pb-0.5 text-[13px] font-bold uppercase tracking-[0.03em] text-u2c-ink group-hover:border-u2c-primary">
                  {category.displayName}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
