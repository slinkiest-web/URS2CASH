import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOrderDetail } from "@/lib/orders/get-order-detail";
import { MarkShippedForm } from "@/components/order/mark-shipped-form";
import { OrderActionButton } from "@/components/order/order-action-button";
import { RatingPromptForm } from "@/components/order/rating-prompt-form";
import { formatKobo } from "@/lib/money";

type Params = { id: string };

const STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid — awaiting shipment",
  shipped: "Shipped — in transit",
  delivered: "Delivered",
  released: "Released",
  disputed: "Disputed",
  refunded: "Refunded",
  cancelled: "Cancelled",
  expired: "Expired",
};

const ACTOR_LABELS: Record<string, string> = {
  buyer: "Buyer",
  seller: "Seller",
  system: "System",
};

/**
 * Server Component (PRD §5.3). This is also §10 Epic D2 AC7's Paystack
 * callback destination (`initiateCheckout`, Prompt 13, sets `callback_url:
 * ${appUrl}/orders/${order.id}`) — "reads order status and displays it...
 * fails if the callback page writes any state." A pure read (no mutation
 * on render) satisfies that structurally; closes Known Issue #26.
 *
 * §9.1 / Known Issue #14: every field on this page comes from
 * `getOrderDetail`, which reads exclusively through
 * `orders_participant_view` — grep this file for `.from("orders")` (the
 * base table) before touching it, it must never appear here.
 */
export default async function OrderDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const order = await getOrderDetail(id);
  if (!order) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || (user.id !== order.buyerId && user.id !== order.sellerId)) {
    // Row-level access is already enforced by orders_participant_view
    // (getOrderDetail returns null for a non-participant), but a
    // signed-out visitor with a stale/shared link falls through here —
    // same 404, never a distinguishable error.
    notFound();
  }

  const isSeller = user.id === order.sellerId;
  const isBuyer = user.id === order.buyerId;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Order</span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {order.listingTitle}
        </h1>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800 sm:grid-cols-3">
        <div className="flex flex-col">
          {/* ISSUE-002 (QA 2026-07-30): reads "Total paid" only once the
              order has actually been paid — otherwise it contradicted the
              "Awaiting payment" status line right above it. */}
          <span className="text-zinc-500 dark:text-zinc-400">{order.status === "pending" ? "Total" : "Total paid"}</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{formatKobo(order.amountKobo)}</span>
        </div>
        {isSeller ? (
          <div className="flex flex-col">
            <span className="text-zinc-500 dark:text-zinc-400">Your payout</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{formatKobo(order.sellerPayoutKobo)}</span>
          </div>
        ) : null}
        {order.autoReleaseAt && order.status === "shipped" ? (
          <div className="flex flex-col">
            <span className="text-zinc-500 dark:text-zinc-400">Auto-release by</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {new Date(order.autoReleaseAt).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" })}
            </span>
          </div>
        ) : null}
      </div>

      {/* §9.1: delivery_* is null here unless status !== 'pending' when
          viewed by the seller — orders_participant_view enforces this, not
          this component. The buyer always sees her own submitted values. */}
      {order.deliveryName ? (
        <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-50">Delivery details</h2>
          <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Name</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{order.deliveryName}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Phone</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{order.deliveryPhone}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-zinc-500 dark:text-zinc-400">Address</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">
                {order.deliveryAddress}, {order.deliveryState}
              </dd>
            </div>
          </dl>
        </div>
      ) : isSeller && order.status === "pending" ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Delivery details will be shown here once payment is confirmed.
        </p>
      ) : null}

      {order.trackingNote ? (
        <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <h2 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">Tracking note</h2>
          <p className="text-zinc-700 dark:text-zinc-300">{order.trackingNote}</p>
        </div>
      ) : null}

      {isSeller && order.status === "paid" ? <MarkShippedForm orderId={order.id} /> : null}
      {isBuyer && order.status === "shipped" ? <OrderActionButton orderId={order.id} action="confirmDelivery" /> : null}
      {isBuyer && order.status === "delivered" ? <OrderActionButton orderId={order.id} action="releaseOrder" /> : null}
      {/* §10 Epic D6 AC1: only on a concluded order (released/refunded),
          never on pending/paid/shipped, and never once already rated
          (ratings are immutable — no edit path exists). */}
      {isBuyer && (order.status === "released" || order.status === "refunded") && !order.hasRating ? (
        <RatingPromptForm orderId={order.id} />
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Order history</h2>
        {order.transitions.length > 0 ? (
          <ol className="flex flex-col gap-3 border-l border-zinc-200 pl-4 dark:border-zinc-800">
            {order.transitions.map((t) => (
              <li key={t.id} className="text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {STATUS_LABELS[t.toStatus] ?? t.toStatus}
                </span>{" "}
                <span className="text-zinc-500 dark:text-zinc-400">
                  · {ACTOR_LABELS[t.actorRole] ?? t.actorRole} ·{" "}
                  {new Date(t.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                </span>
                {t.note ? <p className="text-zinc-600 dark:text-zinc-400">{t.note}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No transitions recorded yet.</p>
        )}
      </div>

      <Link href={isSeller ? "/dashboard/orders" : "/orders"} className="text-sm underline">
        Back to your orders
      </Link>
    </main>
  );
}
