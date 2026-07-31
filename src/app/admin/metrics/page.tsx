import { getMetricsSnapshot } from "@/lib/admin/get-metrics";

function pct(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

function days(v: number | null): string {
  return v === null ? "—" : `${v} day${v === 1 ? "" : "s"}`;
}

function hours(v: number | null): string {
  return v === null ? "—" : `${v} hr${v === 1 ? "" : "s"}`;
}

/**
 * PRD §3 (MVP success framework) / §10 Epic E4. Every figure is computed
 * live from the database via the SQL functions in
 * `20260803090000_admin_metrics.sql` — see that migration's header comment
 * and `src/lib/admin/get-metrics.ts` for exactly how each is defined and
 * why (including the citation-drift corrections against this prompt's own
 * task brief: real section numbers are §3/§3.2/§3.4/§3.5, not "2"/"2.5"/
 * "2.6"; the buyer repeat window is 30 days per §3.2, not the brief's 60;
 * payout latency, an actual §3.2 metric the brief's bullet list dropped,
 * is included anyway).
 */
export default async function AdminMetricsPage() {
  const m = await getMetricsSnapshot();
  const beauty = m.listingToSaleConversionByCategory.find((c) => c.categorySlug === "beauty");
  const beautyConversion = beauty?.conversionRatePercent ?? null;
  const secondListingRate = m.secondListingRate.ratePercent;

  const belowKillThreshold =
    secondListingRate !== null && secondListingRate < 20 && m.diagnosticContext.totalSellerCount >= 50;

  return (
    <main className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Metrics</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Computed from {m.diagnosticContext.totalSellerCount} sellers who have published a listing, over{" "}
          {m.diagnosticContext.weeksSinceLaunch} week{m.diagnosticContext.weeksSinceLaunch === 1 ? "" : "s"} of data.
        </p>
      </div>

      {/* §3.1 primary metric */}
      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Second listing rate within 30 days (primary metric)</p>
        <p className="text-4xl font-semibold text-zinc-900 dark:text-zinc-50">{pct(secondListingRate)}</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {m.secondListingRate.secondListingCount} of {m.secondListingRate.cohortSellerCount} eligible sellers ·
          target 40%+ · kill threshold below 20% after 8 weeks with 50+ sellers
        </p>
        {belowKillThreshold ? (
          <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">
            Below the §3.1 kill threshold at 8+ weeks and 50+ sellers.
          </p>
        ) : null}
      </section>

      {/* §3.2 supporting metrics */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Median time to second listing</p>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{days(m.medianTimeToSecondListingDays)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Buyer repeat rate (30 day)</p>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{pct(m.buyerRepeatRate30d.ratePercent)}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {m.buyerRepeatRate30d.repeatCount} of {m.buyerRepeatRate30d.buyerCount} eligible buyers
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Dispute rate</p>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{pct(m.disputeRate.ratePercent)}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {m.disputeRate.disputedOrderCount} of {m.disputeRate.paidOrderCount} paid orders · flag above 5%
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Off-platform leakage signal rate</p>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{pct(m.leakageSignalRate.ratePercent)}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {m.leakageSignalRate.leakageFlagCount} of {m.leakageSignalRate.publishedListingCount} published listings ·
            flag above 15%
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Median payout latency</p>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{hours(m.medianPayoutLatencyHours)}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Released → marked paid · automate above 48h</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Listing abandonment rate</p>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{pct(m.listingAbandonmentRate.ratePercent)}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {m.listingAbandonmentRate.stuckDraftCount} of {m.listingAbandonmentRate.totalListingCount} listing rows
            stuck at draft — a DB-derived proxy, not the literal draft-started-vs-published event ratio (that event
            isn&apos;t persisted yet)
          </p>
        </div>
      </section>

      {/* Listing to sale conversion, by category */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Listing-to-sale conversion, by category (30-day)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 font-medium">Category</th>
                <th className="py-2 font-medium">Published</th>
                <th className="py-2 font-medium">Converted</th>
                <th className="py-2 font-medium">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {m.listingToSaleConversionByCategory.map((c) => (
                <tr key={c.categorySlug} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 text-zinc-900 dark:text-zinc-50">{c.categoryName}</td>
                  <td className="py-2 text-zinc-700 dark:text-zinc-300">{c.publishedCount}</td>
                  <td className="py-2 text-zinc-700 dark:text-zinc-300">{c.convertedCount}</td>
                  <td className="py-2 text-zinc-700 dark:text-zinc-300">{pct(c.conversionRatePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Time to first sale, by category */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Median time to first sale, by category
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 font-medium">Category</th>
                <th className="py-2 font-medium">Median days to first sale</th>
              </tr>
            </thead>
            <tbody>
              {m.medianTimeToFirstSaleByCategory.map((c) => (
                <tr key={c.categorySlug} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 text-zinc-900 dark:text-zinc-50">{c.categoryName}</td>
                  <td className="py-2 text-zinc-700 dark:text-zinc-300">{days(c.medianDays)}</td>
                </tr>
              ))}
              {m.medianTimeToFirstSaleByCategory.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-2 text-zinc-500 dark:text-zinc-400">
                    No completed first sales yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Weekly seller cohort retention */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Weekly seller cohort retention
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Of each week&apos;s first-time sellers, the % who published any listing in each following week.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4 font-medium">Cohort week</th>
                <th className="py-2 pr-4 font-medium">Size</th>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
                  <th key={w} className="py-2 pr-4 font-medium">
                    W{w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...new Set(m.weeklyCohortRetention.map((r) => r.cohortWeek))].map((week) => {
                const rows = m.weeklyCohortRetention.filter((r) => r.cohortWeek === week);
                return (
                  <tr key={week} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{week}</td>
                    <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{rows[0]?.cohortSize ?? 0}</td>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => {
                      const row = rows.find((r) => r.weekOffset === w);
                      return (
                        <td key={w} className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                          {row && row.isComplete ? pct(row.retentionRatePercent) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {m.weeklyCohortRetention.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-2 text-zinc-500 dark:text-zinc-400">
                    No cohorts yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* §3.4.1 diagnostic matrix */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Diagnostic: supply problem or demand problem?
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          §3.4.1: a low second listing rate is read against Beauty&apos;s listing-to-sale conversion, never alone. This
          panel is a display aid — it does not decide anything.
        </p>
        {!m.diagnosticContext.readingIsReliable ? (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Earlier readings are noise (§3.4.1): evaluate at 8+ weeks post-launch with 50+ sellers. Currently{" "}
            {m.diagnosticContext.weeksSinceLaunch} week{m.diagnosticContext.weeksSinceLaunch === 1 ? "" : "s"} and{" "}
            {m.diagnosticContext.totalSellerCount} seller{m.diagnosticContext.totalSellerCount === 1 ? "" : "s"}.
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border border-zinc-200 p-3 dark:border-zinc-800" />
                <th className="border border-zinc-200 p-3 font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Beauty conversion at or above 40%
                </th>
                <th className="border border-zinc-200 p-3 font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Beauty conversion below 20%
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  {
                    label: "Second listing rate at or above 20%",
                    match: secondListingRate !== null && secondListingRate >= 20,
                    cells: [
                      "Working. Continue. Consider flipping a second category.",
                      "Demand problem. Sellers are loyal, buyers are absent. Category work is irrelevant — the roadmap becomes buyer acquisition and price guidance.",
                    ],
                  },
                  {
                    label: "Second listing rate below 20%",
                    match: secondListingRate !== null && secondListingRate < 20,
                    cells: [
                      "Supply problem, seller experience. Demand works, the seller loop does not. Stop all category work — rebuild the listing flow.",
                      "Both broken. The thesis is unvalidated at the foundation. Do not expand, do not optimise. Return to discovery.",
                    ],
                  },
                ] as const
              ).map((row) => (
                <tr key={row.label}>
                  <td className="border border-zinc-200 p-3 font-medium text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
                    {row.label}
                  </td>
                  {row.cells.map((cell, i) => {
                    const isBeautyHighMatch = i === 0 && beautyConversion !== null && beautyConversion >= 40;
                    const isBeautyLowMatch = i === 1 && beautyConversion !== null && beautyConversion < 20;
                    const isCurrentCell = row.match && (isBeautyHighMatch || isBeautyLowMatch) && m.diagnosticContext.readingIsReliable;
                    return (
                      <td
                        key={i}
                        className={`border border-zinc-200 p-3 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 ${
                          isCurrentCell ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900" : ""
                        }`}
                      >
                        {cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Beauty 30-day conversion: {pct(beautyConversion)}. A conversion between 20% and 40% falls outside both
          defined columns — the matrix intentionally has no cell for that range.
        </p>
      </section>
    </main>
  );
}
