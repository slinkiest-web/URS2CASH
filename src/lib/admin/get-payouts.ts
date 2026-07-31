import { createServiceClient } from "@/lib/supabase/service";

/** Last-4-digits mask — the account number is never shown in full to an admin either. */
function maskAccountNumber(accountNumber: string): string {
  return `••••${accountNumber.slice(-4)}`;
}

export type PayoutQueueItem = {
  id: string;
  orderId: string;
  amountKobo: number;
  isBlocked: boolean;
  daysSinceReleased: number;
  createdAt: string;
};

export type SellerPayoutGroup = {
  sellerId: string;
  sellerDisplayName: string;
  sellerHandle: string;
  /** Null when no queued payout in this group resolved to any payout_accounts row (fully blocked seller). */
  maskedAccount: string | null;
  totalKobo: number;
  payouts: PayoutQueueItem[];
};

export type PayoutQueue = {
  groups: SellerPayoutGroup[];
  /** §10 Epic E3 AC7: "The queue displays total kobo outstanding." */
  totalOutstandingKobo: number;
};

/**
 * PRD §10 Epic E3 AC1: "Lists `queued` payouts with seller, masked account
 * details, amount, and days since release" — grouped by seller per this
 * prompt's own brief, with per-seller and grand totals. Scoped to
 * `status = 'queued'` only (AC1's literal word) — `held` (dispute-frozen,
 * §10 Epic D5 AC3) and `paid`/`failed` payouts are each a different concept
 * with no AC asking for them in this particular view. `is_blocked` (Prompt
 * 16) is carried straight through per row — AC2's "visually flagged and not
 * actionable" is a rendering/action-gating concern, not a filtering one, so
 * blocked rows stay in the queue rather than being hidden.
 */
export async function getPayoutQueue(): Promise<PayoutQueue> {
  const service = createServiceClient();

  const { data: payouts } = await service
    .from("payouts")
    .select("id, order_id, seller_id, payout_account_id, amount_kobo, is_blocked, created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true });

  if (!payouts || payouts.length === 0) {
    return { groups: [], totalOutstandingKobo: 0 };
  }

  const sellerIds = [...new Set(payouts.map((p) => p.seller_id))];
  const { data: sellers } = await service.from("profiles").select("id, display_name, handle").in("id", sellerIds);
  const sellerById = new Map((sellers ?? []).map((s) => [s.id, s]));

  const accountIds = [...new Set(payouts.map((p) => p.payout_account_id).filter((id): id is string => id !== null))];
  const { data: accounts } = accountIds.length
    ? await service.from("payout_accounts").select("id, bank_name, account_number").in("id", accountIds)
    : { data: [] };
  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));

  const orderIds = [...new Set(payouts.map((p) => p.order_id))];
  const { data: orders } = await service.from("orders").select("id, released_at").in("id", orderIds);
  const releasedAtByOrderId = new Map((orders ?? []).map((o) => [o.id, o.released_at]));

  const groupsBySeller = new Map<string, SellerPayoutGroup>();
  let totalOutstandingKobo = 0;

  for (const p of payouts) {
    totalOutstandingKobo += p.amount_kobo;

    const releasedAt = releasedAtByOrderId.get(p.order_id);
    const daysSinceReleased = releasedAt ? Math.floor((Date.now() - new Date(releasedAt).getTime()) / 86_400_000) : 0;
    const account = p.payout_account_id ? accountById.get(p.payout_account_id) : undefined;
    const maskedAccount = account ? `${account.bank_name} ${maskAccountNumber(account.account_number)}` : null;

    let group = groupsBySeller.get(p.seller_id);
    if (!group) {
      const seller = sellerById.get(p.seller_id);
      group = {
        sellerId: p.seller_id,
        sellerDisplayName: seller?.display_name ?? "Seller",
        sellerHandle: seller?.handle ?? "",
        maskedAccount,
        totalKobo: 0,
        payouts: [],
      };
      groupsBySeller.set(p.seller_id, group);
    } else if (!group.maskedAccount && maskedAccount) {
      group.maskedAccount = maskedAccount;
    }

    group.totalKobo += p.amount_kobo;
    group.payouts.push({
      id: p.id,
      orderId: p.order_id,
      amountKobo: p.amount_kobo,
      isBlocked: p.is_blocked,
      daysSinceReleased,
      createdAt: p.created_at,
    });
  }

  return {
    groups: [...groupsBySeller.values()].sort((a, b) => b.totalKobo - a.totalKobo),
    totalOutstandingKobo,
  };
}
