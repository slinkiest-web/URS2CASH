/**
 * Anti-abuse listing limit. PRD §5.4.
 *
 * HARD RULE: the limit is on active listings (status = 'published'), never
 * lifetime listings. Tier is computed from `completed_sales_count`
 * (maintained by trigger, never aggregated here). `listing_limit_override`,
 * when set, supersedes the tier entirely.
 */

export type SellerTier = "new" | "established" | "trusted";

export type ListingLimit = {
  tier: SellerTier;
  /** null means unlimited. */
  cap: number | null;
};

export function computeListingLimit(
  completedSalesCount: number,
  listingLimitOverride: number | null
): ListingLimit {
  const tier: SellerTier =
    completedSalesCount >= 5 ? "trusted" : completedSalesCount >= 1 ? "established" : "new";

  if (listingLimitOverride !== null) {
    return { tier, cap: listingLimitOverride };
  }

  const cap = tier === "trusted" ? null : tier === "established" ? 50 : 10;
  return { tier, cap };
}

const TIER_LABELS: Record<SellerTier, string> = {
  new: "New",
  established: "Established",
  trusted: "Trusted",
};

/** Names the cap, the seller's tier, and what lifts it — never a generic error (§5.4). */
export function listingLimitMessage(tier: SellerTier, cap: number): string {
  const label = TIER_LABELS[tier];
  const liftedBy =
    tier === "new"
      ? "Your first completed sale raises it to 50."
      : tier === "established"
        ? "Five completed sales raise it to unlimited."
        : "Contact support if you need this raised.";
  return `You've reached your active listing limit of ${cap} (${label} tier). ${liftedBy}`;
}
