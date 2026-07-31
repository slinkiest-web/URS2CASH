import Link from "next/link";
import { getPayoutQueue } from "@/lib/admin/get-payouts";
import { formatKobo } from "@/lib/money";
import { MarkPayoutPaidForm } from "@/components/admin/mark-payout-paid-form";
import { MarkPayoutFailedForm } from "@/components/admin/mark-payout-failed-form";

/**
 * PRD §10 Epic E3: the payout queue. AC1 groups `queued` payouts (per this
 * prompt's own brief) by seller with masked account details and totals;
 * AC2 flags blocked (no verified account) rows as not actionable; AC7
 * shows total kobo outstanding. §11.2 HARD RULE: admin never creates a
 * payout here — release_order()/resolve_dispute_release() (Prompts 16/19)
 * are the only creators; this page only marks existing rows paid or
 * failed.
 */
export default async function AdminPayoutsPage() {
  const queue = await getPayoutQueue();

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Payouts</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Total outstanding: {formatKobo(queue.totalOutstandingKobo)}</p>
      </div>

      {queue.groups.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No queued payouts.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {queue.groups.map((group) => (
            <li key={group.sellerId} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <Link
                    href={`/admin/sellers?handle=${group.sellerHandle}`}
                    className="font-semibold text-zinc-900 underline dark:text-zinc-50"
                  >
                    {group.sellerDisplayName}
                  </Link>
                  <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {group.maskedAccount ?? "No verified payout account"}
                  </span>
                </div>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{formatKobo(group.totalKobo)}</span>
              </div>

              <ul className="flex flex-col gap-2">
                {group.payouts.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 border-t border-zinc-100 pt-2 text-sm first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-900"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">Order {p.orderId}</span>
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {formatKobo(p.amountKobo)} · {p.daysSinceReleased} day{p.daysSinceReleased === 1 ? "" : "s"} since release
                        {p.isBlocked ? (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Blocked — no verified account
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <MarkPayoutPaidForm payoutId={p.id} disabled={p.isBlocked} />
                      {!p.isBlocked ? <MarkPayoutFailedForm payoutId={p.id} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
