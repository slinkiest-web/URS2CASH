import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type OrderTransition = {
  id: string;
  fromStatus: string;
  toStatus: string;
  actorRole: string;
  createdAt: string;
  note: string | null;
};

export type OrderDetail = {
  id: string;
  status: string;
  amountKobo: number;
  commissionKobo: number;
  sellerPayoutKobo: number;
  deliveryName: string | null;
  deliveryPhone: string | null;
  deliveryAddress: string | null;
  deliveryState: string | null;
  trackingNote: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  releasedAt: string | null;
  autoReleaseAt: string | null;
  createdAt: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  listingTitle: string;
  transitions: OrderTransition[];
};

/**
 * PRD §9.1 / Known Issue #14: reads exclusively through
 * `orders_participant_view` (Prompt 15's migration), never the base
 * `orders` table directly — the view is what actually nulls
 * `delivery_name`/`phone`/`address`/`state` for a seller viewing a
 * `pending` order. Grep any future change to this file for `.from("orders")`
 * (the base table) before merging; it should never appear here.
 *
 * Row-level access is already the view's own job (`where auth.uid() =
 * buyer_id or auth.uid() = seller_id`), so a `null` return here is
 * indistinguishable between "doesn't exist" and "you're not a participant"
 * — both correctly render as 404 to the caller, never leaking which case it
 * was.
 */
export const getOrderDetail = cache(async (orderId: string): Promise<OrderDetail | null> => {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders_participant_view")
    .select(
      "id, status, amount_kobo, commission_kobo, seller_payout_kobo, delivery_name, delivery_phone, delivery_address, delivery_state, tracking_note, paid_at, shipped_at, delivered_at, released_at, auto_release_at, created_at, buyer_id, seller_id, listing_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || !order.id || !order.status || !order.buyer_id || !order.seller_id || !order.listing_id) return null;

  const [{ data: listing }, { data: transitions }] = await Promise.all([
    supabase.from("listings").select("title").eq("id", order.listing_id).maybeSingle(),
    supabase
      .from("order_status_transitions")
      .select("id, from_status, to_status, actor_role, created_at, note")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    id: order.id,
    status: order.status,
    amountKobo: order.amount_kobo ?? 0,
    commissionKobo: order.commission_kobo ?? 0,
    sellerPayoutKobo: order.seller_payout_kobo ?? 0,
    deliveryName: order.delivery_name,
    deliveryPhone: order.delivery_phone,
    deliveryAddress: order.delivery_address,
    deliveryState: order.delivery_state,
    trackingNote: order.tracking_note,
    paidAt: order.paid_at,
    shippedAt: order.shipped_at,
    deliveredAt: order.delivered_at,
    releasedAt: order.released_at,
    autoReleaseAt: order.auto_release_at,
    createdAt: order.created_at ?? new Date(0).toISOString(),
    buyerId: order.buyer_id,
    sellerId: order.seller_id,
    listingId: order.listing_id,
    listingTitle: listing?.title ?? "Listing",
    transitions: (transitions ?? [])
      .filter(
        (t): t is typeof t & { id: string; from_status: string; to_status: string; actor_role: string; created_at: string } =>
          t.id !== null && t.from_status !== null && t.to_status !== null && t.actor_role !== null && t.created_at !== null
      )
      .map((t) => ({
        id: t.id,
        fromStatus: t.from_status,
        toStatus: t.to_status,
        actorRole: t.actor_role,
        createdAt: t.created_at,
        note: t.note,
      })),
  };
});
