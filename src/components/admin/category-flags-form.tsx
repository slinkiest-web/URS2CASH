"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { setCategoryFlags } from "@/lib/actions/admin";

/**
 * §6.2 HARD RULE: listable and browsable are independent — each checkbox
 * submits on its own, never coupled. §3.4/§6.2: flipping browsable is
 * always a deliberate manual admin action (the confirm() below), never
 * automated by anything in this codebase.
 */
export function CategoryFlagsForm({
  categoryId,
  listable,
  browsable,
}: {
  categoryId: string;
  listable: boolean;
  browsable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function toggle(field: "listable" | "browsable", next: boolean) {
    if (
      field === "browsable" &&
      next &&
      !window.confirm(
        "Make this category browsable? It appears in the buyer category grid and navigation immediately — no deploy required."
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setCategoryFlags(categoryId, { [field]: next });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={listable}
          disabled={pending}
          onChange={(e) => toggle("listable", e.target.checked)}
        />
        Listable
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={browsable}
          disabled={pending}
          onChange={(e) => toggle("browsable", e.target.checked)}
        />
        Browsable
      </label>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}
