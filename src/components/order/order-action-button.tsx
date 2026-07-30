"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmDelivery, releaseOrder } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";

type Action = "confirmDelivery" | "releaseOrder";

const LABELS: Record<Action, { idle: string; pending: string; confirm: string }> = {
  confirmDelivery: {
    idle: "Confirm delivery",
    pending: "Confirming…",
    confirm: "Confirm you've received this item?",
  },
  releaseOrder: {
    idle: "Release funds now",
    pending: "Releasing…",
    confirm: "Release funds to the seller now, before the automatic release window? This can't be undone.",
  },
};

/**
 * PRD §10 Epic D4 AC1 (confirmDelivery, buyer-only, order must be
 * `shipped`) and item 3 (buyer early release, `delivered` -> `released`,
 * optional). Shares one component since both are a single confirm-then-call
 * buyer action with no extra fields — same pattern as
 * RemoveListingButton (Prompt 8).
 */
export function OrderActionButton({ orderId, action }: { orderId: string; action: Action }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const labels = LABELS[action];

  function handleClick() {
    if (!window.confirm(labels.confirm)) return;
    setError(null);
    startTransition(async () => {
      const result = action === "confirmDelivery" ? await confirmDelivery(orderId) : await releaseOrder(orderId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" onClick={handleClick} disabled={pending}>
        {pending ? labels.pending : labels.idle}
      </Button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}
