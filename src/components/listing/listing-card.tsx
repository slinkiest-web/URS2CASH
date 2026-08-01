import Image from "next/image";
import Link from "next/link";
import { formatKobo } from "@/lib/money";
import { isAllowedImageUrl, isPrivateIpImageUrl } from "@/lib/images/allowed-hosts";

export type ListingCardData = {
  id: string;
  title: string;
  priceKobo: number;
  condition: string;
  photoUrl: string | null;
  /** Shown only on cross-category surfaces (search, recently listed) — PRD §10 Epic C2 AC3. */
  categoryName?: string;
  /**
   * urs2cash-ui skill, product card spec: the second photo cross-fades in
   * on hover. Optional and populated only where the calling query joins for
   * it (currently `getRecentlyListed`) — other producers of `ListingCardData`
   * simply render without the hover cross-fade until their own design pass.
   */
  secondPhotoUrl?: string | null;
  /**
   * urs2cash-ui skill, product card spec: "SELLER" meta row. No verified
   * tick is ever rendered here — this app has no seller-verification concept
   * (PRD §15 B2 / DoD item 11e), and the skill itself says a trust signal
   * that isn't real must not render.
   */
  sellerHandle?: string;
};

const CONDITION_LABELS: Record<string, string> = {
  brand_new: "Brand New",
  opened_unused: "Opened but Unused",
  used: "Used",
};

/**
 * Server Component — no interactivity needed for a listing summary card.
 * The hover lift, image cross-fade, and single-image scale are all pure CSS
 * (`group-hover`), so no client JS is needed to satisfy them — matching the
 * urs2cash-ui skill's "near-zero JS" performance rule.
 *
 * PRD §5.3 performance requirement: responsive `sizes`, lazy loading below
 * the fold (the `next/image` default — nothing here sets `priority`), and no
 * layout shift. Listing photos are arbitrary user uploads with no
 * predictable intrinsic aspect ratio, so `fill` inside a fixed-aspect-ratio
 * container is used instead of guessing `width`/`height` — the box's size
 * never depends on the image finishing its own load.
 */
export function ListingCard({ listing }: { listing: ListingCardData }) {
  // §5.3 / ISSUE-001 (QA 2026-07-30): next/image throws synchronously, not
  // a recoverable per-image error, when src's host isn't in next.config.ts's
  // remotePatterns — one bad URL used to 500 the entire page rendering this
  // card, not just this card. The write path (src/lib/listings/schema.ts)
  // now rejects a non-allowlisted URL before it can ever be saved, but this
  // check is what protects pre-existing or externally-written data: it
  // degrades to the "no photo" empty state instead of crashing.
  const showPhoto = listing.photoUrl !== null && isAllowedImageUrl(listing.photoUrl);
  const showSecondPhoto =
    showPhoto &&
    listing.secondPhotoUrl != null &&
    isAllowedImageUrl(listing.secondPhotoUrl) &&
    listing.secondPhotoUrl !== listing.photoUrl;

  return (
    <Link
      href={`/l/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-[var(--u2c-radius-card)] bg-u2c-surface shadow-[var(--u2c-shadow-rest)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-[3px] hover:shadow-[var(--u2c-shadow-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-u2c-focus motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-u2c-line">
        {showPhoto ? (
          <>
            <Image
              src={listing.photoUrl as string}
              alt={listing.title}
              fill
              unoptimized={isPrivateIpImageUrl(listing.photoUrl as string)}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className={`object-cover transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
                showSecondPhoto
                  ? "group-hover:opacity-0"
                  : "group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
              }`}
            />
            {showSecondPhoto ? (
              <Image
                src={listing.secondPhotoUrl as string}
                alt=""
                aria-hidden
                fill
                unoptimized={isPrivateIpImageUrl(listing.secondPhotoUrl as string)}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 motion-reduce:transition-none"
              />
            ) : null}
          </>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-u2c-line p-3">
        {listing.sellerHandle || listing.categoryName ? (
          <span className="text-[13px] font-medium tracking-[0.01em] text-u2c-ink-soft">
            {/* PRD §10 Epic C2 AC3: "Results show the category name on each
                result" — required on every cross-category grid, never
                dropped just because a seller handle is also shown. */}
            {[listing.sellerHandle ? `@${listing.sellerHandle}` : null, listing.categoryName]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
        <h3 className="line-clamp-2 text-[15px] font-medium text-u2c-ink">{listing.title}</h3>
        <span className="mt-1 font-display text-[1.375rem] font-extrabold text-u2c-action">
          {formatKobo(listing.priceKobo)}
        </span>
        <span className="text-[13px] tracking-[0.01em] text-u2c-ink-soft">
          {CONDITION_LABELS[listing.condition] ?? listing.condition}
        </span>
      </div>
    </Link>
  );
}
