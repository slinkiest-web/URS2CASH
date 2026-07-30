import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOrdersAsSeller } from "@/lib/orders/list-orders";
import { formatKobo } from "@/lib/money";

const STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid — mark as shipped",
  shipped: "Shipped",
  delivered: "Delivered",
  released: "Released",
  disputed: "Disputed",
  refunded: "Refunded",
  cancelled: "Cancelled",
  expired: "Expired",
};

/**
 * Server Component (PRD §5.3, §10 Epic D3 AC1: "seller sees paid orders
 * with buyer delivery details" — this list links into `/orders/[id]`,
 * which is where those details actually render, gated by
 * orders_participant_view).
 */
export default async function SellerOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const orders = user ? await getOrdersAsSeller(supabase, user.id) : [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your orders</h1>
      {orders.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 text-sm hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{order.listingTitle}</span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {STATUS_LABELS[order.status] ?? order.status} · {formatKobo(order.amountKobo)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No orders yet.</p>
      )}
    </main>
  );
}
