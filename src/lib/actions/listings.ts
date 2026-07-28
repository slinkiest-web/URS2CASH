"use server";

import { createClient } from "@/lib/supabase/server";
import { categoryRegistry, type CategorySlug } from "@/lib/categories/registry";
import { resolveCategoryAttributes } from "@/lib/categories/resolver";
import { buildListingSubmissionSchema } from "@/lib/listings/schema";
import { computeListingLimit, listingLimitMessage } from "@/lib/listings/limits";
import { scanForContactDetails } from "@/lib/moderation/contact-detector";
import { track } from "@/lib/analytics/events";
import { ok, err, type Result } from "@/lib/result";
import type { Json } from "@/lib/database.types";

export type CreateListingInput = {
  categorySlug: string;
  title: string;
  description: string;
  priceKobo: number;
  condition: string;
  conditionNotes?: string;
  /** Category-specific fields only — `condition` is supplied separately above. */
  attributes: Record<string, unknown>;
  photoUrls: string[];
  flawPhotoIndexes?: number[];
  /** Epoch ms when the listing form first opened (§3.5 `time_to_publish_seconds`). */
  draftStartedAt: number;
};

function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(categoryRegistry, value);
}

/**
 * PRD §11.2: createListing(input): Result<{ listingId: string }>.
 *
 * HARD RULE: `attributes` (plus `condition`, bundled per
 * src/lib/categories/resolver.ts's documented design) is validated against
 * the registry schema resolved from `categorySlug` at runtime — this is the
 * only validation path for category attributes. Listing-level fields
 * (title/description/price/photos/condition_notes) are validated separately
 * by buildListingSubmissionSchema. Both are server-side and authoritative;
 * any client-side validation is a convenience layer only.
 */
export async function createListing(input: CreateListingInput): Promise<Result<{ listingId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in to publish a listing.");
  }

  if (!isCategorySlug(input.categorySlug) || !categoryRegistry[input.categorySlug].listable) {
    track("listing_publish_failed", {
      category_id: input.categorySlug,
      failure_reason: "unknown_or_unlistable_category",
    });
    return err("unknown_category", "Select a valid category.");
  }

  const category = categoryRegistry[input.categorySlug];

  // Listing-level fields — title/description/price/photos/condition_notes.
  const listingSchema = buildListingSubmissionSchema(category);
  const listingParsed = listingSchema.safeParse({
    title: input.title,
    description: input.description,
    priceKobo: input.priceKobo,
    condition: input.condition,
    conditionNotes: input.conditionNotes,
    photoUrls: input.photoUrls,
    flawPhotoIndexes: input.flawPhotoIndexes ?? [],
  });

  // Category attributes + condition membership — the only validation path
  // for category-specific rules (§6.1/§6.4/§6.5). `condition` is bundled
  // into the raw payload because the category schemas' cross-field rules
  // (e.g. "used requires fill_level_percent") key off it.
  const attributesResult = resolveCategoryAttributes(input.categorySlug, {
    condition: input.condition,
    ...input.attributes,
  });

  if (!listingParsed.success) {
    const failureReason = listingParsed.error.issues[0]?.message ?? "Validation failed.";
    track("listing_publish_failed", { category_id: category.slug, failure_reason: failureReason });
    return err("validation_error", failureReason);
  }

  if (!attributesResult.ok) {
    track("listing_publish_failed", {
      category_id: category.slug,
      failure_reason: attributesResult.error.message,
    });
    return err("validation_error", attributesResult.error.message);
  }

  // §5.4 AC0: the limit gate blocks publish (never draft creation), counting
  // only active published listings — never sold/removed/draft, never
  // aggregated ad hoc elsewhere.
  const { data: profile } = await supabase
    .from("profiles")
    .select("completed_sales_count, listing_limit_override")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return err("not_authenticated", "Sign in to publish a listing.");
  }

  const { count: activeListingCount } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .eq("status", "published");

  const limit = computeListingLimit(profile.completed_sales_count, profile.listing_limit_override);

  if (limit.cap !== null && (activeListingCount ?? 0) >= limit.cap) {
    track("listing_limit_reached", {
      seller_id: user.id,
      tier: limit.tier,
      active_listing_count: activeListingCount ?? 0,
    });
    return err("listing_limit_reached", listingLimitMessage(limit.tier, limit.cap));
  }

  // §9.3: flags, never blocks. Real detector lands in a dedicated prompt.
  // TODO(prompt 9): scan title/description/condition_notes for contact
  // details; on a hit, insert a moderation_flags row (source
  // auto_contact_detect, carrying pattern_type/matched_text), raise the
  // listing to the top of the moderation queue, and fire
  // contact_detail_flagged. Submission must still publish either way.
  scanForContactDetails(`${input.title} ${input.description} ${input.conditionNotes ?? ""}`);

  // condition → listings.condition (real column); everything else →
  // listings.attributes (JSONB) — per the resolver's documented split.
  const { condition, ...attributes } = attributesResult.data;

  const { data: categoryRow } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", category.slug)
    .single();

  if (!categoryRow) {
    return err("unknown_category", "Category is not configured.");
  }

  const { data: listing, error: insertError } = await supabase
    .from("listings")
    .insert({
      seller_id: user.id,
      category_id: categoryRow.id,
      title: listingParsed.data.title,
      description: listingParsed.data.description,
      price_kobo: listingParsed.data.priceKobo,
      condition: condition as string, // each category schema types `condition` as a string enum
      condition_notes: listingParsed.data.conditionNotes ?? null,
      status: "published",
      attributes: attributes as Json, // Zod-validated, JSON-safe by construction
      attribute_schema_version: category.schemaVersion,
      photo_urls: listingParsed.data.photoUrls,
      flaw_photo_indexes: listingParsed.data.flawPhotoIndexes,
    })
    .select("id, seller_listing_index")
    .single();

  if (insertError || !listing) {
    return err("insert_failed", "Could not publish your listing. Try again.");
  }

  // §10 Epic B1 AC10: published immediately, no approval step. AC13: fires
  // with every §3.5 property, including the trigger-assigned
  // seller_listing_index and time_to_publish_seconds from listing_draft_started.
  track("listing_published", {
    listing_id: listing.id,
    category_id: category.slug,
    price_kobo: listingParsed.data.priceKobo,
    condition: condition as string,
    photo_count: listingParsed.data.photoUrls.length,
    seller_listing_index: listing.seller_listing_index,
    time_to_publish_seconds: Math.round((Date.now() - input.draftStartedAt) / 1000),
  });

  return ok({ listingId: listing.id });
}
