import {
  getCategoryOverview,
  BROWSABLE_GATE_MIN_LISTINGS,
  BROWSABLE_GATE_MIN_SELLERS,
  BROWSABLE_GATE_MIN_CONVERSION_PERCENT,
} from "@/lib/admin/get-category-overview";
import { CategoryFlagsForm } from "@/components/admin/category-flags-form";

/**
 * PRD §10 Epic E4 / §6.2. AC1: lists every category with independent
 * listable/browsable toggles. AC2: live published listing count, distinct
 * seller count, 30-day listing-to-sale conversion beside each. AC3: no
 * deploy needed — this page (and every public discovery page) reads
 * `categories.browsable` fresh on every request already (no caching layer
 * exists anywhere in this codebase, per the discovery pages' own
 * `createClient()`-forces-dynamic-rendering posture).
 */
export default async function AdminCategoriesPage() {
  const categories = await getCategoryOverview();

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Categories</h1>
        <p className="max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          §3.4 guidance: flip a category to browsable once it holds {BROWSABLE_GATE_MIN_LISTINGS}+ active published
          listings from {BROWSABLE_GATE_MIN_SELLERS}+ distinct sellers, with 30-day listing-to-sale conversion at
          {" "}
          {BROWSABLE_GATE_MIN_CONVERSION_PERCENT}%+. This is guidance only — the toggle is always a manual admin
          decision. There is no automatic promotion anywhere in this codebase.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800"
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{c.name}</span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {c.publishedListingCount} listings · {c.distinctSellerCount} sellers ·{" "}
                {c.conversionRatePercent !== null ? `${c.conversionRatePercent}%` : "—"} 30-day conversion
              </span>
              {c.meetsBrowsableGate && !c.browsable ? (
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Meets the browsable gate</span>
              ) : null}
            </div>
            <CategoryFlagsForm categoryId={c.id} listable={c.listable} browsable={c.browsable} />
          </li>
        ))}
      </ul>
    </main>
  );
}
