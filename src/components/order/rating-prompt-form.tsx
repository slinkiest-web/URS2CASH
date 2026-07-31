"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitRating } from "@/lib/actions/ratings";
import { track } from "@/lib/analytics/events";
import { Button } from "@/components/ui/button";

const SCORES = [1, 2, 3, 4, 5] as const;

/**
 * PRD §10 Epic D6 AC1/AC9: rendered only on a concluded order (`released`/
 * `refunded`) the buyer hasn't already rated (§10 Epic D6 AC1 — never on
 * pending/paid/shipped, enforced by the caller's own status check, not this
 * component). Fires `rating_prompt_shown` once, on mount, since that's the
 * moment the prompt is actually surfaced to the buyer — the same event the
 * 72-hour reminder cron (`/api/cron/rating-reminders`) fires later if this
 * moment passes unrated.
 */
export function RatingPromptForm({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    track("rating_prompt_shown", { order_id: orderId });
    // Fire once per mount only — this component unmounts once hasRating
    // flips true after a successful submit (router.refresh() re-renders the
    // server page, which stops rendering this form at all).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (score === null) {
      setError("Choose a rating from 1 to 5.");
      return;
    }
    const formData = new FormData(e.currentTarget);
    const review = String(formData.get("review") ?? "").trim();
    setError(null);
    startTransition(async () => {
      const result = await submitRating({ orderId, score, review: review === "" ? undefined : review });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Rate the seller</h2>
      <div className="flex gap-2" role="radiogroup" aria-label="Rating from 1 to 5">
        {SCORES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={score === value}
            onClick={() => setScore(value)}
            className={`h-9 w-9 rounded-md border text-sm font-medium ${
              score === value
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      <textarea
        name="review"
        maxLength={500}
        rows={3}
        placeholder="Optional review (up to 500 characters)"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Submitting…" : "Submit rating"}
      </Button>
    </form>
  );
}
