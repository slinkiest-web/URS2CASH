/**
 * §10 Epic B4 AC5: a listing with an order in any status other than
 * `cancelled` or `expired` cannot be removed or edited.
 */
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function hasBlockingOrder(supabase: SupabaseServerClient, listingId: string): Promise<boolean> {
  // orders.listing_id is UNIQUE (§7.1) — at most one order per listing.
  const { data } = await supabase.from("orders").select("status").eq("listing_id", listingId).maybeSingle();

  if (!data) {
    return false;
  }

  return data.status !== "cancelled" && data.status !== "expired";
}
