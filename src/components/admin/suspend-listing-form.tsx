"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suspendListing } from "@/lib/actions/admin";
import { SUSPEND_LISTING_REASONS } from "@/lib/admin/admin-schemas";
import { Button } from "@/components/ui/button";

/**
 * §10 Epic E1 AC2/AC3/AC6: the reason `<select>` includes the two Personal
 * Care takedown reasons AC6 requires exist in the UI, plus a free-text
 * detail field the admin can edit before submitting — the preset just
 * seeds the textarea, it doesn't lock the final `reason` string.
 */
export function SuspendListingForm({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!open) {
    return (
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Suspend
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await suspendListing(listingId, reason);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
    >
      <select
        defaultValue=""
        onChange={(e) => {
          const preset = SUSPEND_LISTING_REASONS.find((r) => r.value === e.target.value);
          if (preset) setReason(preset.label);
        }}
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="" disabled>
          Choose a reason…
        </option>
        {SUSPEND_LISTING_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        minLength={5}
        maxLength={500}
        required
        placeholder="Reason (shown to the seller)"
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Suspending…" : "Confirm suspend"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
