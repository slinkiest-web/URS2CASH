import { getRecentReviews } from "@/lib/admin/get-reviews";
import { HideReviewForm } from "@/components/admin/hide-review-form";

/**
 * Admin review moderation, backing `hideReview` (§11.2). Not tied to a
 * numbered E1-E4 acceptance criterion — see get-reviews.ts's own comment.
 */
export default async function AdminReviewsPage() {
  const reviews = await getRecentReviews();

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Reviews</h1>
      {reviews.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No reviews yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {r.score}/5 · {r.raterDisplayName} on {r.sellerDisplayName}
                </span>
                {r.isHidden ? <span className="text-xs text-zinc-400">Hidden</span> : null}
              </div>
              <p className="text-zinc-700 dark:text-zinc-300">{r.review}</p>
              <span className="text-xs text-zinc-400">
                {new Date(r.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
              </span>
              {!r.isHidden ? <HideReviewForm ratingId={r.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
