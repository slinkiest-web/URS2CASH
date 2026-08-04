import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, FileCheck2, Star, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBrowsableCategories, getCategoryShowcase, getRecentlyListed } from "@/lib/discovery/queries";
import { ListingCard } from "@/components/listing/listing-card";
import { isAllowedImageUrl, isPrivateIpImageUrl } from "@/lib/images/allowed-hosts";
import { CATEGORY_MARKETING_IMAGE } from "@/lib/images/marketing";

/**
 * urs2cash-ui skill, Value-prop tiles spec (Revision 4, warmed in Stage
 * 3c): fixed copy, never genericised, never the word "escrow". Icons stay
 * plain, never inside a coloured circle (that AI-slop pattern is still
 * off-limits) — the "more life" the founder asked for comes from each
 * tile carrying its own quiet warm tint instead of one flat neutral fill
 * repeated four times, and a slightly larger icon.
 */
const VALUE_PROPS = [
  { icon: ShieldCheck, text: "Your money is safe until you get your item", tint: "var(--u2c-warm-blush)" },
  { icon: FileCheck2, text: "Honest condition on every listing", tint: "var(--u2c-warm-sand)" },
  { icon: Star, text: "Trusted sellers, rated by real buyers", tint: "var(--u2c-warm-rose)" },
  { icon: MapPin, text: "Buy and sell across Nigeria", tint: "var(--u2c-warm-cream)" },
] as const;

/**
 * Server Component (PRD §5.3: "Browse ... server rendered, cached at the
 * edge") — no client-side data fetching, first paint carries real content.
 */
export default async function HomePage() {
  const supabase = await createClient();

  // §6.2 HARD RULE: the category grid (including the showcase tiles below)
  // shows only `browsable = true` categories. §6.2's other HARD RULE, just
  // as load-bearing: "recently listed" is an explicitly named cross
  // category surface — `browsable` is never checked for it.
  const [categories, recentlyListed] = await Promise.all([
    getBrowsableCategories(supabase),
    getRecentlyListed(supabase, 12),
  ]);
  const categoryShowcase = await getCategoryShowcase(supabase, categories);

  // urs2cash-ui skill, Header/Hero: real listing photography only, never a
  // stock or generated stand-in (non-negotiable #2). Reuses the same recent
  // listings already fetched above rather than a second query.
  const heroPhotos = recentlyListed
    .map((listing) => listing.photoUrl)
    .filter((url): url is string => url !== null && isAllowedImageUrl(url))
    .slice(0, 2);

  return (
    <main className="flex flex-1 flex-col bg-u2c-canvas">
      <HomeHero photos={heroPhotos} />

      <section className="border-b border-u2c-line">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-px bg-u2c-line sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_PROPS.map(({ icon: Icon, text, tint }) => (
            <div key={text} className="flex flex-col gap-3 p-6" style={{ backgroundColor: tint }}>
              <Icon size={22} strokeWidth={1.75} className="text-u2c-primary" aria-hidden />
              <p className="text-[15px] font-bold leading-snug text-u2c-ink">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-4 py-16 sm:px-6 lg:px-12 lg:py-20">
        <section className="flex flex-col gap-6">
          <h2 className="font-display text-2xl font-extrabold text-u2c-ink sm:text-3xl">Shop by category</h2>
          {categoryShowcase.length > 0 ? (
            // Plain flex-wrap, not a fixed-column grid: a grid with fewer
            // items than columns leaves empty tracks that paint the
            // gap-colour trick's container background across the leftover
            // width (found live, looked like a stray grey block). Each
            // tile carries its own border instead, so unfilled space is
            // just the page background, however many categories exist.
            <div className="flex flex-wrap">
              {categoryShowcase.map((category) => (
                <CategoryTile key={category.slug} category={category} />
              ))}
            </div>
          ) : (
            <p className="text-[15px] text-u2c-ink-soft">No categories open for browsing yet.</p>
          )}
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="font-display text-2xl font-extrabold text-u2c-ink sm:text-3xl">Recently listed</h2>
          {recentlyListed.length > 0 ? (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              {recentlyListed.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-[var(--u2c-radius-card)] border border-u2c-line bg-u2c-surface px-6 py-12">
              <h3 className="font-display text-xl font-extrabold text-u2c-ink">Nothing here yet</h3>
              <p className="text-[15px] text-u2c-ink-soft">
                Be the first to list something. It takes a few minutes to publish.
              </p>
              <Link
                href="/sell"
                className="mt-1 inline-flex h-11 items-center rounded-[var(--u2c-radius-control)] bg-u2c-primary px-6 text-[13px] font-bold uppercase tracking-[0.03em] text-white transition-colors duration-150 hover:bg-u2c-primary-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-u2c-focus"
              >
                Start selling
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * urs2cash-ui skill, Header spec adapted to the hero: real listing photos
 * only, degrading gracefully by how many exist (0, 1, or 2+) rather than
 * padding with a fake image. The headline sits on a dark scrim so it stays
 * legible over unpredictable real user-uploaded photography, never assuming
 * a photo was composed with negative space for text the way a campaign
 * shoot would be.
 */
function HomeHero({ photos }: { photos: string[] }) {
  return (
    <section className="relative flex min-h-[420px] w-full items-end overflow-hidden bg-u2c-ink sm:min-h-[480px]">
      <div className="absolute inset-0 flex">
        {photos.length > 0 ? (
          photos.map((url, index) => (
            <div key={url} className="relative flex-1">
              <Image
                src={url}
                alt=""
                fill
                priority={index === 0}
                unoptimized={isPrivateIpImageUrl(url)}
                sizes="100vw"
                className="object-cover"
              />
            </div>
          ))
        ) : (
          <div className="flex-1 bg-u2c-ink" />
        )}
      </div>
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(0deg, rgba(17,17,17,0.85) 0%, rgba(17,17,17,0.15) 55%, rgba(17,17,17,0.35) 100%)" }}
        aria-hidden
      />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-12 sm:px-6 lg:px-12">
        <h1 className="font-display max-w-2xl text-[clamp(2.25rem,5vw,3.75rem)] font-black leading-[1.05] text-white">
          Buy and sell pre-loved, with confidence
        </h1>
        <p className="max-w-md text-[15px] text-white/80">
          A marketplace for pre-owned pieces from real sellers across Nigeria, with payment held safely until your
          order arrives.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link
            href={`/c/${categoryFallbackSlug}`}
            className="inline-flex h-12 items-center rounded-[var(--u2c-radius-control)] bg-white px-6 text-[13px] font-bold uppercase tracking-[0.03em] text-u2c-ink transition-colors duration-150 hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Shop now
          </Link>
          <Link
            href="/sell"
            className="inline-flex h-12 items-center rounded-[var(--u2c-radius-control)] bg-u2c-primary px-6 text-[13px] font-bold uppercase tracking-[0.03em] text-white transition-colors duration-150 hover:bg-u2c-primary-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Start selling
          </Link>
        </div>
      </div>
    </section>
  );
}

// "Shop now" needs somewhere real to land. Beauty is this product's one
// always-browsable category (PRD §6.4 seed data); if that ever changes,
// the link still resolves to a real category page, never a dead route.
const categoryFallbackSlug = "beauty";

function CategoryTile({
  category,
}: {
  category: { slug: string; displayName: string; photoUrl: string | null };
}) {
  // Design/UX pass Stage 3: a real published listing photo wins where one
  // exists; a category with nothing published yet falls back to its
  // curated marketing image (src/lib/images/marketing.ts) rather than a
  // bare icon, so the showcase never looks half-built to a first visitor.
  const isCategorySlug = (value: string): value is keyof typeof CATEGORY_MARKETING_IMAGE =>
    value in CATEGORY_MARKETING_IMAGE;
  const fallbackImage = isCategorySlug(category.slug) ? CATEGORY_MARKETING_IMAGE[category.slug] : undefined;
  const imageSrc = category.photoUrl !== null && isAllowedImageUrl(category.photoUrl) ? category.photoUrl : fallbackImage;

  return (
    <Link
      href={`/c/${category.slug}`}
      className="group relative flex aspect-[4/5] w-1/2 items-end overflow-hidden border border-u2c-line bg-u2c-ink lg:w-1/4"
    >
      {imageSrc ? (
        <>
          <Image
            src={imageSrc}
            alt=""
            fill
            unoptimized={isPrivateIpImageUrl(imageSrc)}
            sizes="(max-width: 640px) 50vw, 25vw"
            className="object-cover transition-transform duration-[380ms] ease-out group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(0deg, rgba(17,17,17,0.75) 0%, rgba(17,17,17,0) 60%)" }}
            aria-hidden
          />
        </>
      ) : null}
      <span className="font-display relative p-4 text-lg font-extrabold text-white sm:text-xl">
        {category.displayName}
      </span>
    </Link>
  );
}
