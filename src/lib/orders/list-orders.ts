import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type OrderSummary = {
  id: string;
  status: string;
  amountKobo: number;
  createdAt: string;
  listingTitle: string;
};

type SummaryRow = { id: string; status: string; amount_kobo: number; created_at: string; listing_id: string };

async function toSummaries(supabase: Client, rows: SummaryRow[]): Promise<OrderSummary[]> {
  if (rows.length === 0) return [];

  const listingIds = Array.from(new Set(rows.map((r) => r.listing_id)));
  const { data: listings } = await supabase.from("listings").select("id, title").in("id", listingIds);
  const titleByListingId = new Map((listings ?? []).map((l) => [l.id, l.title]));

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    amountKobo: r.amount_kobo,
    createdAt: r.created_at,
    listingTitle: titleByListingId.get(r.listing_id) ?? "Listing",
  }));
}

function toRows(data: Array<Record<string, unknown>> | null): SummaryRow[] {
  return (data ?? []).filter(
    (r): r is SummaryRow =>
      typeof r["id"] === "string" &&
      typeof r["status"] === "string" &&
      typeof r["amount_kobo"] === "number" &&
      typeof r["created_at"] === "string" &&
      typeof r["listing_id"] === "string"
  );
}

/** The buyer's own orders — reads through orders_participant_view, same as getOrderDetail. */
export async function getOrdersAsBuyer(supabase: Client, buyerId: string): Promise<OrderSummary[]> {
  const { data } = await supabase
    .from("orders_participant_view")
    .select("id, status, amount_kobo, created_at, listing_id")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });

  return toSummaries(supabase, toRows(data));
}

/** The seller's own orders — reads through orders_participant_view, same as getOrderDetail. */
export async function getOrdersAsSeller(supabase: Client, sellerId: string): Promise<OrderSummary[]> {
  const { data } = await supabase
    .from("orders_participant_view")
    .select("id, status, amount_kobo, created_at, listing_id")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });

  return toSummaries(supabase, toRows(data));
}
