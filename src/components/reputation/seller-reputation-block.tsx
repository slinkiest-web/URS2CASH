import type { SellerReputation } from "@/lib/reputation/get-seller-reputation";

/**
 * Reusable seller reputation block (PRD §10 Epic C3 AC5/AC5b, §9.2 Job 3).
 * Server Component — no interactivity. Used on listing detail (Prompt 11)
 * and, per Epic C4 AC3, reused as-is on the seller public profile page
 * (Prompt 12) — do not duplicate this rendering logic there.
 *
 * HARD RULES enforced here, not just described:
 * - No verification badge anywhere (§9.2, §15.1 B2) — there is no such
 *   element in this file, and none should ever be added to it.
 * - A seller with `completedSalesCount === 0` renders as "New seller" with
 *   her join date only — never low rated, untrusted, or flagged (§9.2,
 *   AC5b). The zero-sales branch below is the only thing such a seller
 *   sees; nothing else in this component can render for her.
 * - `ratingAverage` only renders when `ratingCount >= 3`; the rating line
 *   itself reads "New seller" below that floor, per §9.2's literal text —
 *   not a hidden line, not a different phrase.
 * - Dispute rate only renders when `completedSalesCount >= 5`.
 */
export function SellerReputationBlock({ reputation }: { reputation: SellerReputation }) {
  const memberSince = new Date(reputation.memberSince).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
  });

  if (reputation.completedSalesCount === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">New seller</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Joined {memberSince}</span>
      </div>
    );
  }

  const disputeRatePercent =
    reputation.completedSalesCount >= 5
      ? Math.round((reputation.disputeUpheldCount / reputation.completedSalesCount) * 100)
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="flex flex-col">
          <span className="text-zinc-500 dark:text-zinc-400">Completed sales</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{reputation.completedSalesCount}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500 dark:text-zinc-400">Member since</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{memberSince}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500 dark:text-zinc-400">Rating</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            {reputation.ratingCount >= 3 && reputation.ratingAverage !== null
              ? `${reputation.ratingAverage.toFixed(1)} ★ (${reputation.ratingCount})`
              : "New seller"}
          </span>
        </div>
        {disputeRatePercent !== null ? (
          <div className="flex flex-col">
            <span className="text-zinc-500 dark:text-zinc-400">Dispute rate</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{disputeRatePercent}%</span>
          </div>
        ) : null}
      </div>

      {reputation.recentReviews.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-900">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Recent reviews</span>
          <ul className="flex flex-col gap-2">
            {reputation.recentReviews.map((review) => (
              <li key={review.id} className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{review.score} ★</span>
                <span className="text-zinc-600 dark:text-zinc-400">{review.review}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
