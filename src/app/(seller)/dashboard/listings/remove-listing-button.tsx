"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeListing } from "@/lib/actions/listings";
import { Button } from "@/components/ui/button";

export function RemoveListingButton({ listingId }: { listingId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    if (!window.confirm("Remove this listing? It will no longer be visible to buyers.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await removeListing(listingId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="destructive" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </Button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}
