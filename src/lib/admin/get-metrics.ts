import { createServiceClient } from "@/lib/supabase/service";

export type CategoryConversion = {
  categorySlug: string;
  categoryName: string;
  publishedCount: number;
  convertedCount: number;
  conversionRatePercent: number | null;
};

export type CategoryFirstSale = {
  categorySlug: string;
  categoryName: string;
  medianDays: number | null;
};

export type CohortRetentionRow = {
  cohortWeek: string;
  weekOffset: number;
  cohortSize: number;
  activeCount: number;
  retentionRatePercent: number | null;
  /** Whether this offset week has actually elapsed yet — an incomplete week is not "0% retention," it's "no reading yet." */
  isComplete: boolean;
};

export type MetricsSnapshot = {
  /** §3.1, the primary metric. */
  secondListingRate: { cohortSellerCount: number; secondListingCount: number; ratePercent: number | null };
  medianTimeToSecondListingDays: number | null;
  listingToSaleConversionByCategory: CategoryConversion[];
  medianTimeToFirstSaleByCategory: CategoryFirstSale[];
  weeklyCohortRetention: CohortRetentionRow[];
  buyerRepeatRate30d: { buyerCount: number; repeatCount: number; ratePercent: number | null };
  disputeRate: { paidOrderCount: number; disputedOrderCount: number; ratePercent: number | null };
  /** §3.2's raw count + §3.3 Assumption 9's percentage framing, both from the same query. */
  leakageSignalRate: { publishedListingCount: number; leakageFlagCount: number; ratePercent: number | null };
  /** DB-derived proxy — see get-metrics.ts's own module comment and docs/DECISIONS.md; not the literal draft-started-vs-published event ratio, which isn't persisted anywhere. */
  listingAbandonmentRate: { totalListingCount: number; stuckDraftCount: number; ratePercent: number | null };
  /** §3.2's 8th supporting metric — present in the PRD, absent from this prompt's own task brief bullet list. Included anyway per "do not omit." */
  medianPayoutLatencyHours: number | null;
  /** §3.4.1's own gating: "Evaluate at 8 weeks post launch, at 50 or more sellers. Earlier readings are noise." */
  diagnosticContext: { totalSellerCount: number; weeksSinceLaunch: number; readingIsReliable: boolean };
};

/**
 * PRD §10 Epic E4 / §3 (MVP success framework). Every figure here is
 * computed directly from `listings`/`orders`/`disputes`/`moderation_flags`
 * via the SQL functions in `20260803090000_admin_metrics.sql` — there is
 * no queryable event stream yet (`track()` is still a console.log stub;
 * Prompt 22 is where that gets consolidated). See that migration's own
 * header comment for the full reasoning behind each metric's exact
 * definition, including the citation-drift corrections against this
 * prompt's own task brief (§3, not "§2"; 30-day buyer repeat window, not
 * 60; no "US-13"/"US-14" exist in the PRD).
 */
export async function getMetricsSnapshot(): Promise<MetricsSnapshot> {
  const service = createServiceClient();

  const [
    secondListingRateRes,
    medianTimeToSecondRes,
    conversionRes,
    firstSaleRes,
    retentionRes,
    buyerRepeatRes,
    disputeRes,
    leakageRes,
    abandonmentRes,
    payoutLatencyRes,
    publishedSellersRes,
  ] = await Promise.all([
    service.rpc("metric_second_listing_rate"),
    service.rpc("metric_median_time_to_second_listing"),
    service.rpc("metric_listing_to_sale_conversion_by_category"),
    service.rpc("metric_median_time_to_first_sale_by_category"),
    service.rpc("metric_weekly_seller_cohort_retention"),
    service.rpc("metric_buyer_repeat_rate_30d"),
    service.rpc("metric_dispute_rate"),
    service.rpc("metric_leakage_signal_rate"),
    service.rpc("metric_listing_abandonment_rate"),
    service.rpc("metric_payout_latency_hours"),
    service.from("listings").select("seller_id, published_at").not("published_at", "is", null),
  ]);

  const secondListingRate = secondListingRateRes.data?.[0];
  const buyerRepeat = buyerRepeatRes.data?.[0];
  const dispute = disputeRes.data?.[0];
  const leakage = leakageRes.data?.[0];
  const abandonment = abandonmentRes.data?.[0];

  const publishedSellers = publishedSellersRes.data ?? [];
  const totalSellerCount = new Set(publishedSellers.map((l) => l.seller_id)).size;
  const earliestPublishedAt = publishedSellers.reduce<string | null>(
    (min, l) => (l.published_at && (!min || l.published_at < min) ? l.published_at : min),
    null
  );
  const weeksSinceLaunch = earliestPublishedAt
    ? Math.floor((Date.now() - new Date(earliestPublishedAt).getTime()) / (7 * 86_400_000))
    : 0;

  const now = Date.now();

  return {
    secondListingRate: {
      cohortSellerCount: secondListingRate?.cohort_seller_count ?? 0,
      secondListingCount: secondListingRate?.second_listing_count ?? 0,
      ratePercent: secondListingRate?.rate_percent ?? null,
    },
    medianTimeToSecondListingDays: medianTimeToSecondRes.data ?? null,
    listingToSaleConversionByCategory: (conversionRes.data ?? []).map((c) => ({
      categorySlug: c.category_slug,
      categoryName: c.category_name,
      publishedCount: c.published_count,
      convertedCount: c.converted_count,
      conversionRatePercent: c.conversion_rate_percent,
    })),
    medianTimeToFirstSaleByCategory: (firstSaleRes.data ?? []).map((c) => ({
      categorySlug: c.category_slug,
      categoryName: c.category_name,
      medianDays: c.median_days,
    })),
    weeklyCohortRetention: (retentionRes.data ?? []).map((r) => ({
      cohortWeek: r.cohort_week,
      weekOffset: r.week_offset,
      cohortSize: r.cohort_size,
      activeCount: r.active_count,
      retentionRatePercent: r.retention_rate_percent,
      isComplete: new Date(r.window_end).getTime() <= now,
    })),
    buyerRepeatRate30d: {
      buyerCount: buyerRepeat?.buyer_count ?? 0,
      repeatCount: buyerRepeat?.repeat_count ?? 0,
      ratePercent: buyerRepeat?.rate_percent ?? null,
    },
    disputeRate: {
      paidOrderCount: dispute?.paid_order_count ?? 0,
      disputedOrderCount: dispute?.disputed_order_count ?? 0,
      ratePercent: dispute?.rate_percent ?? null,
    },
    leakageSignalRate: {
      publishedListingCount: leakage?.published_listing_count ?? 0,
      leakageFlagCount: leakage?.leakage_flag_count ?? 0,
      ratePercent: leakage?.rate_percent ?? null,
    },
    listingAbandonmentRate: {
      totalListingCount: abandonment?.total_listing_count ?? 0,
      stuckDraftCount: abandonment?.stuck_draft_count ?? 0,
      ratePercent: abandonment?.rate_percent ?? null,
    },
    medianPayoutLatencyHours: payoutLatencyRes.data ?? null,
    diagnosticContext: {
      totalSellerCount,
      weeksSinceLaunch,
      readingIsReliable: weeksSinceLaunch >= 8 && totalSellerCount >= 50,
    },
  };
}
