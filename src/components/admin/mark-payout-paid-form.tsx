"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPayoutPaid } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

/** §10 Epic E3 AC3: requires a bank reference. */
export function MarkPayoutPaidForm({ payoutId, disabled }: { payoutId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (disabled) {
    return (
      <span className="text-xs text-zinc-400" title="No verified payout account — not actionable">
        Blocked
      </span>
    );
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Mark paid
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!window.confirm("Confirm the bank transfer has actually been sent before marking this paid?")) return;
    setError(null);
    startTransition(async () => {
      const result = await markPayoutPaid(payoutId, reference);
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
      <input
        type="text"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        minLength={3}
        maxLength={200}
        required
        placeholder="Bank transfer reference"
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Confirm paid"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
