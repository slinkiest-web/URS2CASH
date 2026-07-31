import { createServiceClient } from "@/lib/supabase/service";

/**
 * §3.4 HARD RULE / §6.2: "Flip a category to `browsable` when: it holds 30
 * or more active published listings from 10 or more distinct sellers, and
 * its listing to sale conversion is at or above 15%. Manual admin action.
 * Never automatic." These are guidance-text thresholds only — nothing in
 * this module or its caller ever writes `browsable` itself; that's
 * `setCategoryFlags` (src/lib/actions/admin.ts), always admin-clicked.
 */
export const BROWSABLE_GATE_MIN_LISTINGS = 30;
export const BROWSABLE_GATE_MIN_SELLERS = 10;
export const BROWSABLE_GATE_MIN_CONVERSION_PERCENT = 15;

export type CategoryOverview = {
  id: string;
  slug: string;
  name: string;
  listable: boolean;
  browsable: boolean;
  /** Live count (§6.2: "Admin sees live listing count... next to each flag") — no 30-day cohort restriction, unlike the conversion figure below. */
  publishedListingCount: number;
  distinctSellerCount: number;
  /** §3.2's exact definition (30-day cohort, only listings old enough to have had the full window) — null until at least one eligible listing exists. */
  conversionRatePercent: number | null;
  meetsBrowsableGate: boolean;
};

export async function getCategoryOverview(): Promise<CategoryOverview[]> {
  const service = createServiceClient();

  const [{ data: categories }, { data: publishedListings }, { data: conversion }] = await Promise.all([
    service.from("categories").select("id, slug, name, listable, browsable, sort_order").order("sort_order"),
    service.from("listings").select("category_id, seller_id").eq("status", "published"),
    service.rpc("metric_listing_to_sale_conversion_by_category"),
  ]);

  const conversionBySlug = new Map((conversion ?? []).map((c) => [c.category_slug, c.conversion_rate_percent]));

  return (categories ?? []).map((c) => {
    const inCategory = (publishedListings ?? []).filter((l) => l.category_id === c.id);
    const distinctSellerCount = new Set(inCategory.map((l) => l.seller_id)).size;
    const conversionRatePercent = conversionBySlug.get(c.slug) ?? null;

    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      listable: c.listable,
      browsable: c.browsable,
      publishedListingCount: inCategory.length,
      distinctSellerCount,
      conversionRatePercent,
      meetsBrowsableGate:
        inCategory.length >= BROWSABLE_GATE_MIN_LISTINGS &&
        distinctSellerCount >= BROWSABLE_GATE_MIN_SELLERS &&
        (conversionRatePercent ?? 0) >= BROWSABLE_GATE_MIN_CONVERSION_PERCENT,
    };
  });
}
