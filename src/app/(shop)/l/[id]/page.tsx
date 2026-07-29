import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getListingDetail } from "@/lib/discovery/get-listing";
import { getSellerReputation } from "@/lib/reputation/get-seller-reputation";
import { buildAttributeDisplay } from "@/lib/categories/attribute-display";
import { CONDITION_DEFINITIONS } from "@/lib/categories/shared";
import { inferReferrerSurface } from "@/lib/discovery/referrer-surface";
import { PhotoGallery } from "@/components/listing/photo-gallery";
import { AttributeTable } from "@/components/listing/attribute-table";
import { SupportLink } from "@/components/listing/support-link";
import { SellerReputationBlock } from "@/components/reputation/seller-reputation-block";
import { formatKobo } from "@/lib/money";
import { track } from "@/lib/analytics/events";

type Params = { id: string };

/**
 * PRD §10 Epic C3 AC7: Open Graph tags render title, price, and first
 * photo — "load bearing for pre browsable categories," since a Gadgets or
 * Fashion listing has no category grid to be discovered through; a shared
 * link's preview card is the only pre-click impression it gets.
 */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingDetail(id);
  if (!listing) notFound();

  const priceLabel = formatKobo(listing.priceKobo);
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "";
  const canonicalUrl = `${appUrl}/l/${listing.id}`;
  const firstPhoto = listing.photoUrls[0];

  return {
    title: `${listing.title} — ${priceLabel} | Urs2Cash`,
    description: listing.description.slice(0, 160),
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true },
    openGraph: {
      title: listing.title,
      description: `${priceLabel} · ${CONDITION_DEFINITIONS[listing.condition].label}`,
      type: "website",
      url: canonicalUrl,
      images: firstPhoto ? [{ url: firstPhoto }] : [],
    },
  };
}

/**
 * Server Component (PRD §5.3). §10 Epic C3 AC1: reachable regardless of the
 * category's `browsable` state — grep this file for "browsable" before
 * touching it, it must never appear (same discipline as
 * src/lib/discovery/queries.ts and get-listing.ts).
 *
 * This page carries the entire purchase decision (§9.1: "there is no chat
 * channel") — every section below discharges one of §9.2's four jobs:
 * photos/condition/attributes (Job 1, verify condition), the seller
 * reputation block (Job 3, establish trust), and the support link (Job 4 /
 * §9.1 — the only contact affordance, and it never reaches the seller).
 */
export default async function ListingDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const listing = await getListingDetail(id);
  if (!listing) notFound();

  const [reputation, requestHeaders] = await Promise.all([getSellerReputation(listing.sellerId), headers()]);

  // §10 Epic C1 AC6 / §3.5: fired unconditionally on every render of this
  // page — there is no separate analytics task, the flow that owns the
  // event emits it inline.
  track("listing_viewed", {
    listing_id: listing.id,
    category_id: listing.categorySlug,
    referrer_surface: inferReferrerSurface(requestHeaders.get("referer")),
  });

  const attributeDisplay = buildAttributeDisplay(listing.categorySlug, listing.attributes);
  const conditionInfo = CONDITION_DEFINITIONS[listing.condition];
  const supportEmail = process.env["NEXT_PUBLIC_SUPPORT_EMAIL"] ?? "support@urs2cash.com";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <PhotoGallery photoUrls={listing.photoUrls} flawPhotoIndexes={listing.flawPhotoIndexes} title={listing.title} />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{listing.categoryName}</span>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{listing.title}</h1>
            <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{formatKobo(listing.priceKobo)}</span>
          </div>

          {/* §10 Epic C3 AC6: sold listings display as sold and are not
              purchasable — there is no purchase CTA anywhere on this page
              yet regardless (Epic D is not built), so "not purchasable" is
              already true; this banner is the "display as sold" half. */}
          {listing.status === "sold" ? (
            <span className="inline-block w-fit rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900">
              Sold
            </span>
          ) : null}

          {/* §10 Epic C3 AC4: full definition text, not just the label. A
              native <details> is a zero-JS, accessible way to surface the
              longer definition without a client-side tooltip component. */}
          <details className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <summary className="cursor-pointer font-medium text-zinc-900 dark:text-zinc-50">
              Condition: {conditionInfo.label}
            </summary>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">{conditionInfo.definition}</p>
          </details>

          {/* §6.4.3 two-claims rule: functional_status and cosmetic_grade
              (where present) render here, beside condition, with equal
              prominence — never inside the general attribute table below. */}
          {attributeDisplay.prominent.length > 0 ? (
            <AttributeTable heading="Condition details" rows={attributeDisplay.prominent} />
          ) : null}

          <div>
            <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Description</h2>
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{listing.description}</p>
          </div>

          {/* condition_notes is required, minimum 20 characters, whenever
              condition is `used` (§6.3 HARD RULE) — shown in full, never
              truncated or line-clamped. */}
          {listing.conditionNotes ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Seller&apos;s notes on condition</h2>
              <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{listing.conditionNotes}</p>
            </div>
          ) : null}

          {/* §9.1 HARD RULE: the only contact affordance on this page, and
              it routes to platform support — never the seller. */}
          <SupportLink listingId={listing.id} categorySlug={listing.categorySlug} supportEmail={supportEmail} />
        </div>
      </div>

      {/* §6.4.2: measurements shown as their own table, never inlined. */}
      {attributeDisplay.measurements ? <AttributeTable heading="Measurements" rows={attributeDisplay.measurements} /> : null}

      <AttributeTable heading="Details" rows={attributeDisplay.table} />

      {/* §9.2 Job 3 / §10 Epic C3 AC5-AC5b. The "About the seller" heading
          links to the full public profile (Epic C4, Prompt 12) — the same
          reputation data already fetched here, just also the entry point
          into the seller's full catalogue and review history. */}
      {reputation ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            About the seller ·{" "}
            <Link href={`/s/${reputation.handle}`} className="underline">
              {reputation.displayName}
            </Link>
          </h2>
          <SellerReputationBlock reputation={reputation} />
        </div>
      ) : null}
    </main>
  );
}
