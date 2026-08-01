"use client";

import { useState, useTransition } from "react";
import { initiateCheckout } from "@/lib/actions/orders";
import { nigerianStateSchema, type NigerianState } from "@/lib/validation";
import { formatKobo } from "@/lib/money";
import { Button } from "@/components/ui/button";

const NIGERIAN_STATES = nigerianStateSchema.options;

const inputClassName =
  "rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

/**
 * PRD §10 Epic D1 / §11.2 `initiateCheckout`. Collects delivery details
 * (item 2 — name/phone/address/state; there is no `delivery_city` field,
 * see `src/lib/orders/checkout-schema.ts`), then hands off to
 * `initiateCheckout`. On success this only navigates the browser to
 * Paystack's hosted payment page — the order it just created stays
 * `pending`. §10 Epic D2 HARD RULE: only the webhook (Prompt 14) ever
 * writes `paid`; nothing on this client, including this redirect, does.
 */
export function BuyForm({ listingId, priceKobo }: { listingId: string; priceKobo: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await initiateCheckout({
        listingId,
        deliveryName: String(formData.get("deliveryName") ?? ""),
        deliveryPhone: String(formData.get("deliveryPhone") ?? ""),
        deliveryAddress: String(formData.get("deliveryAddress") ?? ""),
        deliveryState: String(formData.get("deliveryState") ?? "") as NigerianState,
      });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setRedirecting(true);
      window.location.href = result.data.authorizationUrl;
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex flex-col gap-1 border-b border-zinc-100 pb-3 dark:border-zinc-900">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Total</span>
          <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {formatKobo(priceKobo)}
          </span>
        </div>
        {/* §8.4 HARD RULE: stated plainly, before payment — the price shown
            excludes delivery, and delivery is arranged with the seller
            after purchase. No shipping line item anywhere on this form. */}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          This price excludes delivery. You&apos;ll arrange delivery directly with the seller after payment —
          funds are held until you confirm delivery.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="deliveryName" className="text-sm font-medium">
          Recipient name
        </label>
        <input
          id="deliveryName"
          name="deliveryName"
          required
          minLength={2}
          maxLength={100}
          className={inputClassName}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="deliveryPhone" className="text-sm font-medium">
          Delivery phone
        </label>
        <input
          id="deliveryPhone"
          name="deliveryPhone"
          type="tel"
          required
          placeholder="08012345678"
          className={inputClassName}
        />
        <p className="text-xs text-zinc-500">e.g. 08012345678 — we&apos;ll format it for you.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="deliveryAddress" className="text-sm font-medium">
          Delivery address
        </label>
        <textarea
          id="deliveryAddress"
          name="deliveryAddress"
          required
          minLength={10}
          maxLength={500}
          rows={3}
          placeholder="Street address, including city"
          className={inputClassName}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="deliveryState" className="text-sm font-medium">
          State
        </label>
        <select
          id="deliveryState"
          name="deliveryState"
          required
          defaultValue=""
          className={`bg-white ${inputClassName}`}
        >
          <option value="" disabled>
            Select a state
          </option>
          {NIGERIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || redirecting}>
        {redirecting ? "Redirecting to payment…" : pending ? "Starting checkout…" : `Buy now — ${formatKobo(priceKobo)}`}
      </Button>
    </form>
  );
}
