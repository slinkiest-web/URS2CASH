"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markShipped } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";

/** PRD §10 Epic D3 AC2: seller-only, requires a tracking note of 3+ characters. */
export function MarkShippedForm({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const trackingNote = String(formData.get("trackingNote") ?? "");
    setError(null);
    startTransition(async () => {
      const result = await markShipped(orderId, trackingNote);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <label htmlFor="trackingNote" className="text-sm font-medium">
        Mark as shipped
      </label>
      <textarea
        id="trackingNote"
        name="trackingNote"
        required
        minLength={3}
        maxLength={500}
        rows={2}
        placeholder="Tracking note (courier, tracking number, or pickup details)"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Mark as shipped"}
      </Button>
    </form>
  );
}
