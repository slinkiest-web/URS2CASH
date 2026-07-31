import { createServiceClient } from "@/lib/supabase/service";

export type OpenDisputeSummary = {
  id: string;
  orderId: string;
  reason: string;
  createdAt: string;
  listingTitle: string;
  buyerDisplayName: string;
  sellerDisplayName: string;
};

/** PRD §10 Epic E2 AC1: "Lists open disputes." Admin-only — disputes has no
 * SELECT policy covering every row for anyone but the two participants
 * (§7.2), so this reads via the service-role client, same as every other
 * admin query. */
export async function getOpenDisputes(): Promise<OpenDisputeSummary[]> {
  const service = createServiceClient();

  const { data: disputes } = await service
    .from("disputes")
    .select("id, order_id, reason, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (!disputes || disputes.length === 0) return [];

  const orderIds = disputes.map((d) => d.order_id);
  const { data: orders } = await service.from("orders").select("id, listing_id, buyer_id, seller_id").in("id", orderIds);
  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));

  const listingIds = [...new Set((orders ?? []).map((o) => o.listing_id))];
  const { data: listings } = listingIds.length
    ? await service.from("listings").select("id, title").in("id", listingIds)
    : { data: [] };
  const listingById = new Map((listings ?? []).map((l) => [l.id, l]));

  const profileIds = [...new Set((orders ?? []).flatMap((o) => [o.buyer_id, o.seller_id]))];
  const { data: profiles } = profileIds.length
    ? await service.from("profiles").select("id, display_name").in("id", profileIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return disputes.map((d) => {
    const order = orderById.get(d.order_id);
    const listing = order ? listingById.get(order.listing_id) : undefined;
    return {
      id: d.id,
      orderId: d.order_id,
      reason: d.reason,
      createdAt: d.created_at,
      listingTitle: listing?.title ?? "(listing not found)",
      buyerDisplayName: order ? (profileById.get(order.buyer_id)?.display_name ?? "Buyer") : "Buyer",
      sellerDisplayName: order ? (profileById.get(order.seller_id)?.display_name ?? "Seller") : "Seller",
    };
  });
}

export type DisputeDetail = {
  id: string;
  status: string;
  reason: string;
  detail: string;
  evidenceUrls: string[];
  createdAt: string;
  orderId: string;
  orderStatus: string;
  amountKobo: number;
  sellerPayoutKobo: number;
  deliveryName: string;
  deliveryAddress: string;
  deliveryState: string;
  deliveryPhone: string;
  trackingNote: string | null;
  paystackReference: string | null;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  buyerDisplayName: string;
  buyerHandle: string;
  sellerId: string;
  sellerDisplayName: string;
  sellerHandle: string;
};

/**
 * PRD §10 Epic E2 AC1: "full order, listing, both parties, and evidence."
 * Reads the base `orders` table directly (not `orders_participant_view`) —
 * that view's privacy nulling exists to protect delivery details from the
 * *seller* pre-payment (§9.1); it has no bearing on admin, who legitimately
 * needs full context to arbitrate and is never subject to that gate.
 */
export async function getDisputeDetail(disputeId: string): Promise<DisputeDetail | null> {
  const service = createServiceClient();

  const { data: dispute } = await service
    .from("disputes")
    .select("id, status, reason, detail, evidence_urls, created_at, order_id")
    .eq("id", disputeId)
    .maybeSingle();

  if (!dispute) return null;

  const { data: order } = await service
    .from("orders")
    .select(
      "id, status, amount_kobo, seller_payout_kobo, delivery_name, delivery_address, delivery_state, delivery_phone, tracking_note, paystack_reference, listing_id, buyer_id, seller_id"
    )
    .eq("id", dispute.order_id)
    .maybeSingle();

  if (!order) return null;

  const [{ data: listing }, { data: buyer }, { data: seller }] = await Promise.all([
    service.from("listings").select("id, title").eq("id", order.listing_id).maybeSingle(),
    service.from("profiles").select("id, display_name, handle").eq("id", order.buyer_id).maybeSingle(),
    service.from("profiles").select("id, display_name, handle").eq("id", order.seller_id).maybeSingle(),
  ]);

  return {
    id: dispute.id,
    status: dispute.status,
    reason: dispute.reason,
    detail: dispute.detail,
    evidenceUrls: dispute.evidence_urls,
    createdAt: dispute.created_at,
    orderId: order.id,
    orderStatus: order.status,
    amountKobo: order.amount_kobo,
    sellerPayoutKobo: order.seller_payout_kobo,
    deliveryName: order.delivery_name,
    deliveryAddress: order.delivery_address,
    deliveryState: order.delivery_state,
    deliveryPhone: order.delivery_phone,
    trackingNote: order.tracking_note,
    paystackReference: order.paystack_reference,
    listingId: order.listing_id,
    listingTitle: listing?.title ?? "(listing not found)",
    buyerId: order.buyer_id,
    buyerDisplayName: buyer?.display_name ?? "Buyer",
    buyerHandle: buyer?.handle ?? "",
    sellerId: order.seller_id,
    sellerDisplayName: seller?.display_name ?? "Seller",
    sellerHandle: seller?.handle ?? "",
  };
}
