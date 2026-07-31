"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPayoutFailed } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

/** §10 Epic E3 AC4: requires a failure note; a fresh queued retry row appears automatically. */
export function MarkPayoutFailedForm({ payoutId }: { payoutId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Mark failed
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await markPayoutFailed(payoutId, note);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        minLength={5}
        maxLength={500}
        required
        placeholder="Why did this transfer fail? (e.g. wrong account number)"
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Confirm failed"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
