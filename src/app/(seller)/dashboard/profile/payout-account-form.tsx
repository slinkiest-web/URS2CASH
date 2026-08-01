"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveAndSavePayoutAccount } from "@/lib/actions/profile";
import { NIGERIAN_BANKS } from "@/lib/paystack/banks";
import { Button } from "@/components/ui/button";

/** §10 Epic A3 AC6: "Account number is masked in all UI after save, showing last 4 only." */
function maskAccountNumber(accountNumber: string): string {
  return `••••••${accountNumber.slice(-4)}`;
}

export function PayoutAccountForm({
  existing,
}: {
  existing: { bankName: string; accountNumber: string; accountName: string } | null;
}) {
  // Collapsed by default even for a brand new seller with no account yet —
  // this is optional setup for after a first sale, not something to shove
  // in front of someone who just finished creating their profile.
  const [open, setOpen] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await resolveAndSavePayoutAccount(bankCode, accountNumber);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setAccountNumber("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        {existing ? (
          <div className="flex flex-col">
            <span className="text-zinc-900 dark:text-zinc-50">{existing.accountName}</span>
            <span className="text-zinc-500 dark:text-zinc-400">
              {existing.bankName} · {maskAccountNumber(existing.accountNumber)}
            </span>
          </div>
        ) : (
          <span className="text-zinc-500 dark:text-zinc-400">No payout account added yet.</span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {existing ? "Change" : "Add payout details"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payout account</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {/* §10 Epic A3 AC3 HARD RULE: no account-name field exists in this
            form at all — it can only ever come from Paystack's own
            resolve response, never typed by the seller. */}
        <select
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          required
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="" disabled>
            Choose your bank…
          </option>
          {NIGERIAN_BANKS.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{10}"
          maxLength={10}
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
          required
          placeholder="10-digit account number"
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending || bankCode === "" || accountNumber.length !== 10}>
            {pending ? "Verifying…" : "Resolve and save"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
