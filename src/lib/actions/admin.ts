"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/admin/require-admin";
import {
  suspendListingInputSchema,
  suspendSellerInputSchema,
  dismissFlagInputSchema,
  setListingLimitOverrideInputSchema,
  hideReviewInputSchema,
} from "@/lib/admin/admin-schemas";
import { ok, err, type Result } from "@/lib/result";

/**
 * PRD §11.2: suspendListing(listingId, reason): Result<void>. §10 Epic E1
 * AC2/AC3/AC4/AC5.
 *
 * Every write happens inside `admin_suspend_listing()` (Prompt 19's
 * migration) — a single atomic call that sets the listing suspended with
 * its reason AND closes out any open moderation_flags rows for it
 * (reviewed_by/reviewed_at, AC5), so a suspend from the queue can never
 * leave a stale open flag behind. Works whether or not the listing was
 * ever flagged (AC4) — there's simply nothing to close if it wasn't.
 *
 * "Removes it from all buyer surfaces" (AC3) needs no code here: every
 * public read path (search, category browse, listing detail) already
 * filters to `status in ('published', 'sold')` at the RLS level — a
 * `suspended` row is structurally invisible the instant this commits.
 *
 * AC3's seller email is a call site only, same deferred-to-Prompt-22
 * pattern as every other notification in this codebase.
 */
export async function suspendListing(listingId: string, reason: string): Promise<Result<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return err(admin.error.code, admin.error.message);
  }

  const parsed = suspendListingInputSchema.safeParse({ listingId, reason });
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Enter a reason.");
  }

  const service = createServiceClient();
  const { data: transitioned, error } = await service.rpc("admin_suspend_listing", {
    p_listing_id: parsed.data.listingId,
    p_admin_id: admin.data.adminId,
    p_reason: parsed.data.reason,
  });

  if (error || !transitioned || transitioned.length === 0) {
    return err("not_found", "Listing not found.");
  }

  return ok(undefined);
}

/**
 * PRD §11.2: suspendSeller(profileId, reason): Result<void>. §5.4:
 * "suspension and restriction remain available to admin independent of
 * limits." Sets `profiles.is_suspended` (§7.1's own column) plus the
 * audit trio this prompt adds (`suspension_reason`/`suspended_at`/
 * `suspended_by`) — without those, the `reason` argument would be
 * silently discarded, a real defect for an accountability action.
 *
 * Deliberately does not cascade to the seller's existing listings (no AC
 * asks for it, and `suspendListing`/`suspendSeller` are two independent
 * levers per §11.2's action list — same "don't add an unrequested
 * restriction" reasoning as Decision #38). The seller's public profile
 * already disappears for free: `profiles_public` (Decision #1) filters
 * `where is_suspended = false`.
 */
export async function suspendSeller(profileId: string, reason: string): Promise<Result<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return err(admin.error.code, admin.error.message);
  }

  const parsed = suspendSellerInputSchema.safeParse({ profileId, reason });
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Enter a reason.");
  }

  const service = createServiceClient();
  const { data: updated, error } = await service
    .from("profiles")
    .update({
      is_suspended: true,
      suspension_reason: parsed.data.reason,
      suspended_at: new Date().toISOString(),
      suspended_by: admin.data.adminId,
    })
    .eq("id", parsed.data.profileId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return err("not_found", "Seller not found.");
  }

  return ok(undefined);
}

/**
 * PRD §11.2: setListingLimitOverride(profileId, limit): Result<void>. §5.4
 * HARD RULE: "profiles.listing_limit_override, when not NULL, supersedes
 * the tier entirely... the escape hatch for a genuine high volume founding
 * seller who has not yet sold." `limit: null` clears the override, back to
 * the tier table in `computeListingLimit()`.
 */
export async function setListingLimitOverride(profileId: string, limit: number | null): Promise<Result<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return err(admin.error.code, admin.error.message);
  }

  const parsed = setListingLimitOverrideInputSchema.safeParse({ profileId, limit });
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Enter a valid limit.");
  }

  const service = createServiceClient();
  const { data: updated, error } = await service
    .from("profiles")
    .update({ listing_limit_override: parsed.data.limit })
    .eq("id", parsed.data.profileId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return err("not_found", "Seller not found.");
  }

  return ok(undefined);
}

/**
 * PRD §11.2: hideReview(ratingId, reason): Result<void>. HARD RULE: "sets
 * is_hidden only. It has no path to score, rating_average, or
 * rating_count" — the UPDATE below touches exactly that one column, no
 * more. `reason` is required for admin accountability and logged (never
 * persisted on `ratings` itself — the HARD RULE's "is_hidden only" is read
 * literally: no new column was added to carry it, matching how this
 * codebase never widens a table beyond what a HARD RULE explicitly allows).
 */
export async function hideReview(ratingId: string, reason: string): Promise<Result<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return err(admin.error.code, admin.error.message);
  }

  const parsed = hideReviewInputSchema.safeParse({ ratingId, reason });
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Enter a reason.");
  }

  const service = createServiceClient();
  const { data: updated, error } = await service
    .from("ratings")
    .update({ is_hidden: true })
    .eq("id", parsed.data.ratingId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return err("not_found", "Review not found.");
  }

  // Internal detail only (§11.3: "internal detail is logged, never
  // returned") — the reason is never persisted on the ratings row itself.
  console.log("[hideReview]", { ratingId: parsed.data.ratingId, adminId: admin.data.adminId, reason: parsed.data.reason });

  return ok(undefined);
}

/**
 * PRD §11.2: dismissFlag(flagId): Result<void>. §10 Epic E1 AC2/AC5:
 * clears an open flag with no other action — `reviewed_by`/`reviewed_at`
 * written here directly since this is a single-table write with no other
 * invariant to hold atomically (unlike suspendListing, which also has to
 * touch `listings` in the same transaction).
 */
export async function dismissFlag(flagId: string): Promise<Result<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return err(admin.error.code, admin.error.message);
  }

  const parsed = dismissFlagInputSchema.safeParse({ flagId });
  if (!parsed.success) {
    return err("invalid_input", "Invalid flag.");
  }

  const service = createServiceClient();
  const { data: updated, error } = await service
    .from("moderation_flags")
    .update({ status: "dismissed", reviewed_by: admin.data.adminId, reviewed_at: new Date().toISOString() })
    .eq("id", parsed.data.flagId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return err("not_found", "Flag not found or already reviewed.");
  }

  return ok(undefined);
}
