"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissFlag } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

/** §10 Epic E1 AC2: dismiss with no other action — no reason required. */
export function DismissFlagButton({ flagId }: { flagId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await dismissFlag(flagId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "Dismissing…" : "Dismiss"}
      </Button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}
