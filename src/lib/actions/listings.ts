"use server";

import { createClient } from "@/lib/supabase/server";
import { validateListingSubmission, type ListingSubmissionRaw } from "@/lib/listings/validate-submission";
import { checkListingLimitGate } from "@/lib/listings/check-limit-gate";
import { hasBlockingOrder } from "@/lib/listings/has-blocking-order";
import { listingLimitMessage } from "@/lib/listings/limits";
import { scanForContactDetails } from "@/lib/moderation/contact-detector";
import { flagContactDetection } from "@/lib/moderation/flag-contact-detection";
import { track } from "@/lib/analytics/track-server";
import { ok, err, type Result } from "@/lib/result";
import type { Json } from "@/lib/database.types";

export type CreateListingInput = ListingSubmissionRaw & {
  /** Epoch ms when the listing form first opened (§3.5 `time_to_publish_seconds`). */
  draftStartedAt: number;
  /**
   * §5.4 HARD RULE: draft creation is never capped. A draft still requires
   * full validation (§6.1 — no partially-valid persisted state); it's the
   * cap check and `status` that differ from a straight publish.
   */
  saveAsDraft?: boolean;
};

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

  const validation = validateListingSubmission(input);

  if (!validation.ok) {
    await track(
      "listing_publish_failed",
      { category_id: input.categorySlug, failure_reason: validation.error.message },
      user.id
    );
    return err(validation.error.code, validation.error.message);
  }

  const data = validation.data;

  if (!input.saveAsDraft) {
    const gate = await checkListingLimitGate(supabase, user.id);
    if (!gate.ok) {
      return err("not_authenticated", "Sign in to publish a listing.");
    }
    if (gate.blocked) {
      await track(
        "listing_limit_reached",
        { seller_id: user.id, tier: gate.limit.tier, active_listing_count: gate.activeCount },
        user.id
      );
      return err(
        "listing_limit_reached",
        listingLimitMessage(gate.limit.tier, gate.limit.cap as number)
      );
    }
  }

  // §9.3 HARD RULE: flags, never blocks — scanned here, before the write,
  // but the resulting moderation_flags row/event only fire below, after the
  // insert succeeds (flagContactDetection needs the new listing's id).
  const contactDetection = scanForContactDetails(
    `${data.title} ${data.description} ${data.conditionNotes ?? ""}`
  );

  const { data: categoryRow } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", data.categoryConfig.slug)
    .single();

  if (!categoryRow) {
    return err("unknown_category", "Category is not configured.");
  }

  const status = input.saveAsDraft ? "draft" : "published";

  const { data: listing, error: insertError } = await supabase
    .from("listings")
    .insert({
      seller_id: user.id,
      category_id: categoryRow.id,
      title: data.title,
      description: data.description,
      price_kobo: data.priceKobo,
      condition: data.condition,
      condition_notes: data.conditionNotes,
      status,
      attributes: data.attributes as Json, // Zod-validated, JSON-safe by construction
      attribute_schema_version: data.categoryConfig.schemaVersion,
      photo_urls: data.photoUrls,
      flaw_photo_indexes: data.flawPhotoIndexes,
      // §7.1 HARD RULE: assigned by the assign_seller_listing_index trigger,
      // never by application code. The column has no DB-level DEFAULT (only
      // the trigger fills it), so the generated Insert type correctly
      // requires a value here — this placeholder is always overwritten
      // before the row commits: to the real sequence number when the
      // trigger's publish branch fires, otherwise to its own `0` sentinel
      // for a non-published insert (docs/DECISIONS.md #16).
      seller_listing_index: 0,
    })
    .select("id, seller_listing_index")
    .single();

  if (insertError || !listing) {
    return err("insert_failed", "Could not save your listing. Try again.");
  }

  // §9.3 HARD RULE: the write above has already succeeded — this can only
  // ever add a flag alongside that success, never affect it. Runs for
  // drafts too: a draft is still a submission of listing text, and catching
  // leakage as early as possible is strictly better than waiting for publish.
  await flagContactDetection({
    listingId: listing.id,
    categorySlug: data.categoryConfig.slug,
    detection: contactDetection,
    actorId: user.id,
  });

  // §10 Epic B1 AC10: published immediately, no approval step. AC13: fires
  // with every §3.5 property, including the trigger-assigned
  // seller_listing_index and time_to_publish_seconds from listing_draft_started.
  // Never fires for a draft save — publishing hasn't happened yet.
  if (!input.saveAsDraft) {
    await track(
      "listing_published",
      {
        listing_id: listing.id,
        category_id: data.categoryConfig.slug,
        price_kobo: data.priceKobo,
        condition: data.condition,
        photo_count: data.photoUrls.length,
        seller_listing_index: listing.seller_listing_index,
        time_to_publish_seconds: Math.round((Date.now() - input.draftStartedAt) / 1000),
      },
      user.id
    );
  }

  return ok({ listingId: listing.id });
}

export type UpdateListingInput = {
  listingId: string;
  title?: string;
  description?: string;
  /** Rejected server-side if the listing is already published (§11.2 HARD RULE). */
  priceKobo?: number;
  /** Rejected server-side if the listing is already published (§11.2 HARD RULE). */
  condition?: string;
  /** Rejected server-side if the listing is already published (§11.2 HARD RULE). */
  categorySlug?: string;
  conditionNotes?: string;
  attributes?: Record<string, unknown>;
  photoUrls?: string[];
  flawPhotoIndexes?: number[];
  /** Attempt to transition a draft to published. Ignored if already published. */
  publish?: boolean;
};

/**
 * PRD §11.2: updateListing(input): Result<void>.
 *
 * HARD RULE: rejects any attempt to change price_kobo, condition, or
 * category_id on a listing whose status is `published`, at the action
 * level — never relying on the UI hiding those fields. Every write is
 * fully re-validated (§6.1); unset fields fall back to the listing's
 * current values, so a partial edit can never persist an inconsistent
 * combination (e.g. a new condition without that condition's required
 * fields).
 */
export async function updateListing(input: UpdateListingInput): Promise<Result<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in to edit your listing.");
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", input.listingId)
    .eq("seller_id", user.id)
    .single();

  if (!listing) {
    return err("not_found", "Listing not found.");
  }

  if (listing.status !== "draft" && listing.status !== "published") {
    return err("not_editable", "This listing can no longer be edited.");
  }

  if (await hasBlockingOrder(supabase, input.listingId)) {
    return err("order_in_progress", "This listing has an order in progress and cannot be edited.");
  }

  if (
    listing.status === "published" &&
    (input.priceKobo !== undefined || input.condition !== undefined || input.categorySlug !== undefined)
  ) {
    return err(
      "immutable_field",
      "Price, condition, and category cannot be changed once published. Remove and relist instead."
    );
  }

  const { data: currentCategory } = await supabase
    .from("categories")
    .select("slug")
    .eq("id", listing.category_id)
    .single();

  if (!currentCategory) {
    return err("unknown_category", "Category is not configured.");
  }

  const validation = validateListingSubmission({
    categorySlug: input.categorySlug ?? currentCategory.slug,
    title: input.title ?? listing.title,
    description: input.description ?? listing.description,
    priceKobo: input.priceKobo ?? listing.price_kobo,
    condition: input.condition ?? listing.condition,
    conditionNotes: input.conditionNotes ?? listing.condition_notes ?? undefined,
    attributes: input.attributes ?? (listing.attributes as Record<string, unknown>),
    photoUrls: input.photoUrls ?? listing.photo_urls,
    flawPhotoIndexes: input.flawPhotoIndexes ?? listing.flaw_photo_indexes,
  });

  if (!validation.ok) {
    return err(validation.error.code, validation.error.message);
  }

  const data = validation.data;

  // §9.3 HARD RULE: scanned on every edit, same as at creation — never a
  // gate. The resulting flag/event only fire below, after the update
  // succeeds. Not deduplicated against prior flags on the same listing: a
  // repeat detection across edits is itself a legitimate signal (§9.3 point
  // 5 — "suspends the listing on repeat offence").
  const contactDetection = scanForContactDetails(
    `${data.title} ${data.description} ${data.conditionNotes ?? ""}`
  );

  // §5.4: the cap only ever gates an actual publish transition, never an
  // edit to an already-published listing and never a draft save.
  let nextStatus = listing.status;
  if (listing.status === "draft" && input.publish) {
    const gate = await checkListingLimitGate(supabase, user.id);
    if (!gate.ok) {
      return err("not_authenticated", "Sign in to publish your listing.");
    }
    if (gate.blocked) {
      await track(
        "listing_limit_reached",
        { seller_id: user.id, tier: gate.limit.tier, active_listing_count: gate.activeCount },
        user.id
      );
      return err(
        "listing_limit_reached",
        listingLimitMessage(gate.limit.tier, gate.limit.cap as number)
      );
    }
    nextStatus = "published";
  }

  const { data: categoryRow } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", data.categoryConfig.slug)
    .single();

  if (!categoryRow) {
    return err("unknown_category", "Category is not configured.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("listings")
    .update({
      category_id: categoryRow.id,
      title: data.title,
      description: data.description,
      price_kobo: data.priceKobo,
      condition: data.condition,
      condition_notes: data.conditionNotes,
      attributes: data.attributes as Json,
      attribute_schema_version: data.categoryConfig.schemaVersion,
      photo_urls: data.photoUrls,
      flaw_photo_indexes: data.flawPhotoIndexes,
      status: nextStatus,
    })
    .eq("id", input.listingId)
    .select("seller_listing_index")
    .single();

  if (updateError || !updated) {
    return err("update_failed", "Could not save your listing. Try again.");
  }

  await flagContactDetection({
    listingId: input.listingId,
    categorySlug: data.categoryConfig.slug,
    detection: contactDetection,
    actorId: user.id,
  });

  if (nextStatus === "published" && listing.status === "draft") {
    await track(
      "listing_published",
      {
        listing_id: input.listingId,
        category_id: data.categoryConfig.slug,
        price_kobo: data.priceKobo,
        condition: data.condition,
        photo_count: data.photoUrls.length,
        seller_listing_index: updated.seller_listing_index,
        // No draftStartedAt survives a resumed-later draft — created_at is
        // the closest available proxy for when this listing was first started.
        time_to_publish_seconds: Math.round((Date.now() - new Date(listing.created_at).getTime()) / 1000),
      },
      user.id
    );
  }

  return ok(undefined);
}

/**
 * PRD §11.2: removeListing(listingId): Result<void>.
 * §10 Epic B4 AC4: sets status = 'removed'. Excluded from all buyer
 * surfaces (the existing `listings_select_published` RLS policy already
 * only serves `published` rows publicly); retained for reporting, never
 * deleted. AC5: blocked while an order is in progress.
 */
export async function removeListing(listingId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in to remove your listing.");
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("seller_id", user.id)
    .single();

  if (!listing) {
    return err("not_found", "Listing not found.");
  }

  if (await hasBlockingOrder(supabase, listingId)) {
    return err("order_in_progress", "This listing has an order in progress and cannot be removed.");
  }

  const { error } = await supabase.from("listings").update({ status: "removed" }).eq("id", listingId);

  if (error) {
    return err("update_failed", "Could not remove your listing. Try again.");
  }

  return ok(undefined);
}
