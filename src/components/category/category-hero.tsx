import Image from "next/image";
import { isPrivateIpImageUrl } from "@/lib/images/allowed-hosts";

/**
 * Design/UX pass Stage 3: a full-bleed hero band for a category page,
 * matching the homepage's own `HomeHero` treatment (src/app/(marketing)/
 * page.tsx) so the two surfaces read as one system rather than a rich home
 * page bolted onto bare category tabs. `imageSrc` is resolved by the caller
 * (a real published listing photo where one exists, a curated marketing
 * fallback otherwise, or a gender-specific marketing image while a Fashion
 * gender filter is active) — this component has no photo-selection logic
 * of its own, matching the registry-driven "no per-category branching"
 * discipline the rest of this page follows.
 */
export function CategoryHero({ displayName, imageSrc }: { displayName: string; imageSrc: string | null }) {
  return (
    <section className="relative flex h-56 w-full items-end overflow-hidden bg-u2c-ink sm:h-72">
      {imageSrc ? (
        <>
          <Image
            src={imageSrc}
            alt=""
            fill
            priority
            unoptimized={isPrivateIpImageUrl(imageSrc)}
            sizes="100vw"
            className="object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(0deg, rgba(17,17,17,0.8) 0%, rgba(17,17,17,0.15) 55%, rgba(17,17,17,0.3) 100%)",
            }}
            aria-hidden
          />
        </>
      ) : null}
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6 lg:px-12">
        <h1 className="font-display text-[clamp(1.75rem,4vw,3rem)] font-black leading-[1.05] text-white">
          {displayName}
        </h1>
      </div>
    </section>
  );
}
