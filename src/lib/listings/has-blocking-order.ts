/**
 * §10 Epic B4 AC5: a listing with an order in any status other than
 * `cancelled` or `expired` cannot be removed or edited.
 */
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function hasBlockingOrder(supabase: SupabaseServerClient, listingId: string): Promise<boolean> {
  // orders.listing_id is only unique among active-status rows since Prompt
  // 13's orders_listing_id_active_unique partial index (docs/DECISIONS.md
  // #54) — a listing can accumulate more than one order row over its
  // lifetime (e.g. one expired, one pending), so this can no longer assume
  // at most one row and use `.maybeSingle()`. Any row not cancelled/expired
  // blocks, regardless of how many rows exist in total.
  const { data } = await supabase
    .from("orders")
    .select("status")
    .eq("listing_id", listingId)
    .not("status", "in", "(cancelled,expired)")
    .limit(1);

  return (data?.length ?? 0) > 0;
}
