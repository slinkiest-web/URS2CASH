import { notFound } from "next/navigation";
import { getSellerProfile } from "@/lib/discovery/get-seller-profile";
import { getSellerListings } from "@/lib/discovery/queries";
import { getSellerReputation } from "@/lib/reputation/get-seller-reputation";
import { getSellerReviews } from "@/lib/reputation/get-seller-reviews";
import { createClient } from "@/lib/supabase/server";
import { SellerReputationBlock } from "@/components/reputation/seller-reputation-block";
import { ListingCard } from "@/components/listing/listing-card";

type Params = { handle: string };
type SearchParams = { listings_page?: string; reviews_page?: string };

function buildHref(handle: string, current: SearchParams, overrides: SearchParams): string {
  const next = new URLSearchParams();
  if (current.listings_page) next.set("listings_page", current.listings_page);
  if (current.reviews_page) next.set("reviews_page", current.reviews_page);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return `/s/${handle}${qs ? `?${qs}` : ""}`;
}

/**
 * Server Component (PRD §5.3). §10 Epic C4 AC2 / §4 (seller profile ignores
 * `browsable`): `getSellerListings` lists every published listing across
 * ALL categories — grep this file and get-seller-profile.ts/queries.ts for
 * "browsable" before touching, it must never appear here, same discipline
 * as src/lib/discovery/queries.ts and get-listing.ts.
 *
 * §9.2 Job 3 / AC3: the reputation block is imported as-is from Prompt 11
 * (src/components/reputation/seller-reputation-block.tsx) — no reputation
 * rendering logic is duplicated in this file.
 *
 * §5.2/§9.1 HARD RULE: no buyer-to-seller contact mechanism anywhere on
 * this page. A buyer's question routes through listing detail's support
 * link (Prompt 11), never through a seller-profile-level contact affordance.
 */
export default async function SellerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { handle } = await params;
  const resolvedSearchParams = await searchParams;

  const profile = await getSellerProfile(handle);
  if (!profile) notFound();

  const listingsPage = Math.max(1, Number(resolvedSearchParams.listings_page) || 1);
  const reviewsPage = Math.max(1, Number(resolvedSearchParams.reviews_page) || 1);

  const supabase = await createClient();

  const [reputation, listings, reviews] = await Promise.all([
    getSellerReputation(profile.id),
    getSellerListings(supabase, profile.id, listingsPage),
    getSellerReviews(profile.id, reviewsPage),
  ]);

  const memberSince = new Date(profile.memberSince).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-8 dark:border-zinc-800 sm:flex-row sm:items-start">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-xl font-semibold text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600">
          {/* Avatar URL is arbitrary seller-supplied input (src/lib/validation/index.ts),
              not restricted to an allowlisted host the way listing photos are — a plain
              <img>, not next/image, avoids adding every possible external host to
              next.config.ts's remotePatterns. */}
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt={profile.displayName} className="h-full w-full object-cover" />
          ) : (
            <span>{profile.displayName.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {profile.displayName}
          </h1>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Joined {memberSince}
            {profile.state ? ` · ${profile.state}` : ""}
          </span>
          {profile.bio ? <p className="mt-2 max-w-xl text-sm text-zinc-700 dark:text-zinc-300">{profile.bio}</p> : null}
        </div>
      </div>

      {reputation ? <SellerReputationBlock reputation={reputation} /> : null}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Listings</h2>
        {listings.items.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {listings.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No published listings yet.</p>
        )}
        {listingsPage > 1 || listings.hasMore ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            {listingsPage > 1 ? (
              <a
                href={buildHref(handle, resolvedSearchParams, { listings_page: String(listingsPage - 1) })}
                className="underline"
              >
                Previous
              </a>
            ) : (
              <span />
            )}
            {listings.hasMore ? (
              <a
                href={buildHref(handle, resolvedSearchParams, { listings_page: String(listingsPage + 1) })}
                className="underline"
              >
                Next
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Reviews</h2>
        {reviews.items.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {reviews.items.map((review) => (
              <li key={review.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{review.score} ★</span>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">{review.review}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No reviews yet.</p>
        )}
        {reviewsPage > 1 || reviews.hasMore ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            {reviewsPage > 1 ? (
              <a
                href={buildHref(handle, resolvedSearchParams, { reviews_page: String(reviewsPage - 1) })}
                className="underline"
              >
                Previous
              </a>
            ) : (
              <span />
            )}
            {reviews.hasMore ? (
              <a
                href={buildHref(handle, resolvedSearchParams, { reviews_page: String(reviewsPage + 1) })}
                className="underline"
              >
                Next
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
