import { notFound } from "next/navigation";
import Link from "next/link";
import { getDisputeDetail } from "@/lib/admin/get-disputes";
import { formatKobo } from "@/lib/money";
import { ResolveDisputeForm } from "@/components/admin/resolve-dispute-form";

type Params = { id: string };

/** PRD §10 Epic E2 AC1: "full order, listing, both parties, and evidence." */
export default async function AdminDisputeDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const dispute = await getDisputeDetail(id);
  if (!dispute) notFound();

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Dispute</span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          <Link href={`/l/${dispute.listingId}`} target="_blank" className="underline">
            {dispute.listingTitle}
          </Link>
        </h1>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Status: {dispute.status}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800 sm:grid-cols-2">
        <div className="flex flex-col">
          <span className="text-zinc-500 dark:text-zinc-400">Buyer</span>
          <Link href={`/admin/sellers?handle=${dispute.buyerHandle}`} className="font-medium text-zinc-900 underline dark:text-zinc-50">
            {dispute.buyerDisplayName}
          </Link>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500 dark:text-zinc-400">Seller</span>
          <Link href={`/admin/sellers?handle=${dispute.sellerHandle}`} className="font-medium text-zinc-900 underline dark:text-zinc-50">
            {dispute.sellerDisplayName}
          </Link>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500 dark:text-zinc-400">Order status</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{dispute.orderStatus}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500 dark:text-zinc-400">Amount</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            {formatKobo(dispute.amountKobo)} (seller payout {formatKobo(dispute.sellerPayoutKobo)})
          </span>
        </div>
        <div className="sm:col-span-2">
          <span className="text-zinc-500 dark:text-zinc-400">Delivery</span>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            {dispute.deliveryName} · {dispute.deliveryPhone} · {dispute.deliveryAddress}, {dispute.deliveryState}
          </p>
        </div>
        {dispute.trackingNote ? (
          <div className="sm:col-span-2">
            <span className="text-zinc-500 dark:text-zinc-400">Tracking note</span>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{dispute.trackingNote}</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-50">
          {dispute.reason.replaceAll("_", " ")}
        </h2>
        <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{dispute.detail}</p>
        <span className="mt-2 block text-xs text-zinc-400">
          Raised {new Date(dispute.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>

      {dispute.evidenceUrls.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Evidence</h2>
          <div className="flex flex-wrap gap-2">
            {dispute.evidenceUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- internal admin tool, no SEO/perf requirement */}
                <img src={url} alt="Evidence" loading="lazy" className="size-32 rounded-md border border-zinc-200 object-cover dark:border-zinc-800" />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {dispute.status === "open" ? (
        <ResolveDisputeForm disputeId={dispute.id} />
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">This dispute has already been resolved.</p>
      )}
    </main>
  );
}
