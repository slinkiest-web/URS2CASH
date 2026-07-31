import { getSellerAdminDetailByHandle } from "@/lib/admin/get-seller-admin-detail";
import { SuspendSellerForm } from "@/components/admin/suspend-seller-form";
import { ListingLimitOverrideForm } from "@/components/admin/listing-limit-override-form";

type SearchParams = { handle?: string };

/**
 * Backs `suspendSeller`/`setListingLimitOverride` (§11.2, §5.4). No PRD AC
 * asks for a full paginated seller directory — a handle lookup is the
 * minimal surface that makes both actions reachable (the moderation queue
 * and dispute pages both link here with `?handle=` for exactly this
 * reason).
 */
export default async function AdminSellersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { handle } = await searchParams;
  const seller = handle ? await getSellerAdminDetailByHandle(handle) : null;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Sellers</h1>
      <form action="/admin/sellers" method="get" className="flex gap-2 text-sm">
        <input
          type="text"
          name="handle"
          defaultValue={handle ?? ""}
          placeholder="Seller handle"
          className="w-64 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1 dark:border-zinc-700">
          Search
        </button>
      </form>

      {handle && !seller ? <p className="text-sm text-zinc-500 dark:text-zinc-400">No seller found with handle &quot;{handle}&quot;.</p> : null}

      {seller ? (
        <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{seller.displayName}</p>
              <p className="text-zinc-500 dark:text-zinc-400">@{seller.handle}</p>
            </div>
            {seller.isSuspended ? (
              <span className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                Suspended
              </span>
            ) : null}
          </div>

          {seller.isSuspended && seller.suspensionReason ? (
            <p className="text-zinc-700 dark:text-zinc-300">Reason: {seller.suspensionReason}</p>
          ) : null}

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Completed sales</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-50">{seller.completedSalesCount}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Rating</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                {seller.ratingAverage !== null ? `${seller.ratingAverage} (${seller.ratingCount})` : "New seller"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Disputes upheld</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-50">{seller.disputeUpheldCount}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Active listings</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-50">{seller.activeListingCount}</dd>
            </div>
          </dl>

          <ListingLimitOverrideForm profileId={seller.id} currentValue={seller.listingLimitOverride} />

          {!seller.isSuspended ? <SuspendSellerForm profileId={seller.id} /> : null}
        </div>
      ) : null}
    </main>
  );
}
