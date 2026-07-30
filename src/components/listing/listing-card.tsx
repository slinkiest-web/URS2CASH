import Image from "next/image";
import Link from "next/link";
import { formatKobo } from "@/lib/money";
import { isAllowedImageUrl } from "@/lib/images/allowed-hosts";

export type ListingCardData = {
  id: string;
  title: string;
  priceKobo: number;
  condition: string;
  photoUrl: string | null;
  /** Shown only on cross-category surfaces (search, recently listed) — PRD §10 Epic C2 AC3. */
  categoryName?: string;
};

const CONDITION_LABELS: Record<string, string> = {
  brand_new: "Brand New",
  opened_unused: "Opened but Unused",
  used: "Used",
};

/**
 * Server Component — no interactivity needed for a listing summary card.
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

  return (
    <Link
      href={`/l/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
    >
      <div className="relative aspect-square w-full bg-zinc-100 dark:bg-zinc-900">
        {showPhoto ? (
          <Image
            src={listing.photoUrl as string}
            alt={listing.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {listing.categoryName ? (
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {listing.categoryName}
          </span>
        ) : null}
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {listing.title}
        </h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {CONDITION_LABELS[listing.condition] ?? listing.condition}
        </span>
        <span className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {formatKobo(listing.priceKobo)}
        </span>
      </div>
    </Link>
  );
}
