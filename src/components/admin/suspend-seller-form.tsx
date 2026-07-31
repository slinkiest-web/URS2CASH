"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suspendSeller } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

/** §5.4: "suspension and restriction remain available to admin independent of limits." */
export function SuspendSellerForm({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!open) {
    return (
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Suspend seller
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await suspendSeller(profileId, reason);
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
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        minLength={5}
        maxLength={500}
        required
        placeholder="Reason for suspending this account"
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
