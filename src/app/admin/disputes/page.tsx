import Link from "next/link";
import { getOpenDisputes } from "@/lib/admin/get-disputes";

/** PRD §10 Epic E2 AC1: "Lists open disputes." */
export default async function AdminDisputesPage() {
  const disputes = await getOpenDisputes();

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Open disputes</h1>
      {disputes.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No open disputes.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {disputes.map((d) => (
            <li key={d.id}>
              <Link
                href={`/admin/disputes/${d.id}`}
                className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 text-sm hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{d.listingTitle}</span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {d.reason} · {d.buyerDisplayName} vs {d.sellerDisplayName} ·{" "}
                  {new Date(d.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
