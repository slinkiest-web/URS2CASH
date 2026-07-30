import Image from "next/image";
import { isAllowedImageUrl } from "@/lib/images/allowed-hosts";

/**
 * Server Component — a pure-CSS scroll-snap gallery, no client JS required
 * to swipe between photos (PRD §5.3 performance: minimal JS on the
 * purchase-decision page). Flaw-tagged photos (§10 Epic C3 AC2) get a
 * visible label. The first photo gets `priority` — it's the page's LCP
 * element — every other photo lazy-loads, same discipline as ListingCard.
 *
 * §5.3 / ISSUE-001 (QA 2026-07-30): a photo URL outside next.config.ts's
 * next/image allowlist crashes the whole page, not just its own slot — see
 * ListingCard's comment for the full reasoning. Guarded the same way here,
 * per photo, without filtering the array (flawPhotoIndexes indexes into the
 * original position, which must stay stable).
 */
export function PhotoGallery({
  photoUrls,
  flawPhotoIndexes,
  title,
}: {
  photoUrls: string[];
  flawPhotoIndexes: number[];
  title: string;
}) {
  const flawSet = new Set(flawPhotoIndexes);

  if (photoUrls.length === 0) {
    return <div className="aspect-square w-full rounded-lg bg-zinc-100 dark:bg-zinc-900" />;
  }

  return (
    <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-lg">
      {photoUrls.map((url, index) => (
        <div
          key={`${url}-${index}`}
          className="relative aspect-square w-full flex-none snap-center overflow-hidden rounded-lg bg-zinc-100 sm:w-2/3 dark:bg-zinc-900"
        >
          {isAllowedImageUrl(url) ? (
            <Image
              src={url}
              alt={`${title} — photo ${index + 1}`}
              fill
              sizes="(max-width: 640px) 100vw, 66vw"
              priority={index === 0}
              className="object-cover"
            />
          ) : null}
          {flawSet.has(index) ? (
            <span className="absolute left-2 top-2 rounded bg-zinc-900/80 px-2 py-1 text-xs font-medium text-zinc-50">
              Wear evidence
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
