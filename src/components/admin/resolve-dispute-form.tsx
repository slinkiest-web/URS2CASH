"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveDispute } from "@/lib/actions/disputes";
import { Button } from "@/components/ui/button";

/**
 * PRD §10 Epic E2 AC2/AC3/AC4: outcome is one of exactly two values,
 * `admin_notes` (here: `notes`) is required — the submit button stays
 * disabled until at least 10 characters are entered, mirroring the
 * server-side floor in resolveDisputeInputSchema so the form doesn't round
 * -trip a guaranteed-to-fail request.
 */
export function ResolveDisputeForm({ disputeId }: { disputeId: string }) {
  const [outcome, setOutcome] = useState<"buyer" | "seller" | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!outcome) {
      setError("Choose an outcome.");
      return;
    }
    if (!window.confirm(`Resolve this dispute for the ${outcome}? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await resolveDispute(disputeId, outcome, notes);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push("/admin/disputes");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Resolve dispute</h2>
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input type="radio" name="outcome" value="buyer" checked={outcome === "buyer"} onChange={() => setOutcome("buyer")} />
          Resolve for buyer (refund)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="outcome" value="seller" checked={outcome === "seller"} onChange={() => setOutcome("seller")} />
          Resolve for seller (release funds)
        </label>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        minLength={10}
        maxLength={1000}
        required
        placeholder="Admin notes explaining this resolution (required)"
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="destructive" disabled={pending || !outcome || notes.trim().length < 10} className="self-start">
        {pending ? "Resolving…" : "Resolve dispute"}
      </Button>
    </form>
  );
}
