import Link from "next/link";
import { getOpenModerationFlags, getRecentListings } from "@/lib/admin/get-moderation-queue";
import { formatKobo } from "@/lib/money";
import { DismissFlagButton } from "@/components/admin/dismiss-flag-button";
import { SuspendListingForm } from "@/components/admin/suspend-listing-form";

/**
 * PRD §10 Epic E1 AC1: "Lists open moderation_flags newest first with the
 * listing preview inline" — the primary section below. AC4 ("admin may
 * suspend any listing directly, whether or not flagged") needs a second,
 * browsable surface, since the flags list only ever contains listings
 * something already flagged — the "All recent listings" section below is
 * that surface.
 *
 * §9.3 point 3 / Decision #40: a freshly flagged listing is "raised to the
 * top of the queue" purely by being the newest row in a newest-first list —
 * no separate priority mechanism exists or is needed, including for
 * Gadgets: nothing in §6.4.3 defines a distinct "auto-flag" path (its
 * HARD RULEs like `screen_condition: cracked blocks publish` reject at
 * submission via Zod, never reaching this queue at all) — Gadgets listings
 * get exactly the same generic contact-detector flag treatment as every
 * other category, with nothing extra to build here.
 */
export default async function ModerationPage() {
  const [flags, recentListings] = await Promise.all([getOpenModerationFlags(), getRecentListings()]);

  return (
    <main className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Open flags</h1>
        {flags.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No open flags.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {flags.map((flag) => (
              <li key={flag.id} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row">
                <div className="flex shrink-0 gap-3">
                  {flag.listingPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- internal admin tool, no SEO/perf requirement (see layout.tsx metadata)
                    <img
                      src={flag.listingPhotoUrl}
                      alt=""
                      loading="lazy"
                      className="size-20 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="size-20 shrink-0 rounded-md bg-zinc-100 dark:bg-zinc-900" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 text-sm">
                  <Link href={`/l/${flag.listingId}`} target="_blank" className="font-medium text-zinc-900 underline dark:text-zinc-50">
                    {flag.listingTitle}
                  </Link>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Status: {flag.listingStatus} · Seller:{" "}
                    {flag.sellerHandle ? (
                      <Link href={`/admin/sellers?handle=${flag.sellerHandle}`} className="underline">
                        {flag.sellerDisplayName ?? flag.sellerHandle}
                      </Link>
                    ) : (
                      (flag.sellerDisplayName ?? "unknown")
                    )}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {flag.source === "auto_contact_detect" ? `Detected: ${flag.patternType}` : flag.reason}
                  </span>
                  {flag.matchedText ? (
                    <span className="rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      &quot;{flag.matchedText}&quot;
                    </span>
                  ) : null}
                  <span className="text-xs text-zinc-400">
                    Flagged {new Date(flag.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
                <div className="flex flex-col items-start gap-2 sm:w-56">
                  <DismissFlagButton flagId={flag.id} />
                  <SuspendListingForm listingId={flag.listingId} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">All recent listings</h2>
        <ul className="flex flex-col gap-2">
          {recentListings.map((listing) => (
            <li
              key={listing.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col">
                <Link href={`/l/${listing.id}`} target="_blank" className="font-medium text-zinc-900 underline dark:text-zinc-50">
                  {listing.title}
                </Link>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {listing.status} · {formatKobo(listing.priceKobo)}
                  {listing.sellerHandle ? ` · @${listing.sellerHandle}` : ""}
                </span>
              </div>
              {listing.status === "suspended" ? (
                <span className="text-xs text-zinc-400">Suspended</span>
              ) : (
                <SuspendListingForm listingId={listing.id} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
