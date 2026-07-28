import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { categoryRegistry, type CategorySlug } from "@/lib/categories/registry";
import { formatKobo } from "@/lib/money";
import { RemoveListingButton } from "./remove-listing-button";

function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(categoryRegistry, value);
}

/** Presentation-only — no shared date-formatting helper exists elsewhere yet. */
function formatAge(isoDate: string): string {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month" : `${months} months`;
}

const STATUS_SECTIONS = [
  { status: "draft", heading: "Drafts" },
  { status: "published", heading: "Published" },
  { status: "sold", heading: "Sold" },
  { status: "removed", heading: "Removed" },
] as const;

export default async function SellerListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth: middleware already protects this route.
  if (!user) {
    redirect("/sign-in?redirectTo=/dashboard/listings");
  }

  const { data: rows } = await supabase
    .from("listings")
    .select("id, category_id, title, price_kobo, status, created_at")
    .eq("seller_id", user.id)
    .in(
      "status",
      STATUS_SECTIONS.map((s) => s.status)
    )
    .order("created_at", { ascending: false });

  const { data: categoryRows } = await supabase.from("categories").select("id, slug");
  const categoryNameById = new Map<string, string>();
  for (const row of categoryRows ?? []) {
    if (isCategorySlug(row.slug)) {
      categoryNameById.set(row.id, categoryRegistry[row.slug].displayName);
    }
  }

  const listingsByStatus = new Map<string, NonNullable<typeof rows>>();
  for (const row of rows ?? []) {
    const bucket = listingsByStatus.get(row.status) ?? [];
    bucket.push(row);
    listingsByStatus.set(row.status, bucket);
  }

  const hasAnyListings = (rows ?? []).length > 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your listings</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Resume drafts, edit what&apos;s live, or list something new.
          </p>
        </div>
        <a
          href="/sell"
          className="rounded-lg bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Sell an item
        </a>
      </div>

      {!hasAnyListings ? (
        <p className="mt-10 text-sm text-zinc-600 dark:text-zinc-400">
          You haven&apos;t listed anything yet.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {STATUS_SECTIONS.map(({ status, heading }) => {
            const listings = listingsByStatus.get(status) ?? [];
            if (listings.length === 0) return null;

            return (
              <section key={status}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  {heading} ({listings.length})
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {listings.map((listing) => (
                    <li
                      key={listing.id}
                      className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{listing.title}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {categoryNameById.get(listing.category_id) ?? "Uncategorized"} ·{" "}
                          {formatKobo(listing.price_kobo)} · listed {formatAge(listing.created_at)} ago
                          {/* view_count doesn't exist in the schema yet — docs/KNOWN_ISSUES.md */}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {status === "draft" || status === "published" ? (
                          <>
                            <a
                              href={`/sell?listing=${listing.id}`}
                              className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                            >
                              {status === "draft" ? "Resume" : "Edit"}
                            </a>
                            <RemoveListingButton listingId={listing.id} />
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
