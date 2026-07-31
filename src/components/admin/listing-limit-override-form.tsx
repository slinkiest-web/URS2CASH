"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setListingLimitOverride } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

/** §5.4 HARD RULE: "listing_limit_override, when not NULL, supersedes the tier entirely." */
export function ListingLimitOverrideForm({ profileId, currentValue }: { profileId: string; currentValue: number | null }) {
  const [value, setValue] = useState(currentValue?.toString() ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = value.trim();
    const limit = trimmed === "" ? null : Number(trimmed);
    if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
      setError("Enter a whole number, or leave blank to clear the override.");
      return;
    }
    startTransition(async () => {
      const result = await setListingLimitOverride(profileId, limit);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500 dark:text-zinc-400">Listing limit override</span>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Use tier default"
          className="w-40 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {error ? (
        <span className="text-red-600 dark:text-red-400" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
