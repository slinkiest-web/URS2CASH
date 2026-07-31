import Link from "next/link";
import { getOpenModerationFlags } from "@/lib/admin/get-moderation-queue";
import { getOpenDisputes } from "@/lib/admin/get-disputes";
import { getPayoutQueue } from "@/lib/admin/get-payouts";
import { formatKobo } from "@/lib/money";

export default async function AdminHomePage() {
  const [flags, disputes, payoutQueue] = await Promise.all([
    getOpenModerationFlags(),
    getOpenDisputes(),
    getPayoutQueue(),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Admin</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/admin/moderation"
          className="rounded-lg border border-zinc-200 p-4 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Open flags</p>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{flags.length}</p>
        </Link>
        <Link
          href="/admin/disputes"
          className="rounded-lg border border-zinc-200 p-4 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Open disputes</p>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{disputes.length}</p>
        </Link>
        <Link
          href="/admin/payouts"
          className="rounded-lg border border-zinc-200 p-4 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Payouts outstanding</p>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{formatKobo(payoutQueue.totalOutstandingKobo)}</p>
        </Link>
      </div>
    </main>
  );
}
