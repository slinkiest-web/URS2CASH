"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/admin/require-admin";
import {
  suspendListingInputSchema,
  suspendSellerInputSchema,
  dismissFlagInputSchema,
  setListingLimitOverrideInputSchema,
  hideReviewInputSchema,
  markPayoutPaidInputSchema,
  markPayoutFailedInputSchema,
} from "@/lib/admin/admin-schemas";
import { track } from "@/lib/analytics/events";
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

/**
 * PRD §11.2: markPayoutPaid(payoutId, reference): Result<void>. §10 Epic E3
 * AC3/AC5.
 *
 * `mark_payout_paid()` (Prompt 20's migration) is the actual guard —
 * `status='queued' AND is_blocked=false` — so an already-paid/-failed
 * payout, or a blocked one, can't be marked paid even if the UI's own
 * disabled state were bypassed. Fires `payout_marked_paid` with
 * `hours_since_released`, computed from the constituent order's
 * `released_at` (not the payout row's own `created_at`, which is normally
 * the same instant but shouldn't be assumed to always be).
 *
 * No order-side write happens here at all — §8.1's state machine has no
 * transition after `released` tied to payout completion; payout status is
 * tracked entirely on `payouts`, never mirrored onto `orders` (see
 * docs/DECISIONS.md for the citation-drift note this resolves).
 *
 * AC6 (seller emailed on paid) is a call site only, same Prompt-22
 * deferral as every other notification in this codebase.
 */
export async function markPayoutPaid(payoutId: string, reference: string): Promise<Result<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return err(admin.error.code, admin.error.message);
  }

  const parsed = markPayoutPaidInputSchema.safeParse({ payoutId, reference });
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Enter a bank reference.");
  }

  const service = createServiceClient();
  const { data: transitioned, error } = await service.rpc("mark_payout_paid", {
    p_payout_id: parsed.data.payoutId,
    p_admin_id: admin.data.adminId,
    p_reference: parsed.data.reference,
  });

  const payout = transitioned?.[0];
  if (error || !payout) {
    return err("invalid_transition", "This payout isn't ready to be marked paid — it may already be paid, failed, or blocked.");
  }

  const { data: order } = await service.from("orders").select("released_at").eq("id", payout.order_id).maybeSingle();
  const hoursSinceReleased = order?.released_at
    ? Math.round((Date.now() - new Date(order.released_at).getTime()) / 3_600_000)
    : 0;

  track("payout_marked_paid", { payout_id: payout.id, hours_since_released: hoursSinceReleased });

  return ok(undefined);
}

/**
 * PRD §11.2: markPayoutFailed(payoutId, note): Result<void>. §10 Epic E3
 * AC4: "requires failure_note and returns the payout to queued on retry."
 *
 * `mark_payout_failed()` keeps the failing row permanently at
 * `status='failed'` (the historical record, `failure_note` intact — never
 * mutated back to `queued` in place) and inserts a fresh `queued` retry row
 * for the same order in the same transaction, re-resolving the seller's
 * payout account from scratch. See docs/DECISIONS.md for the full reasoning
 * — the HARD RULE's own "non-failed" phrasing is what rules out the
 * simpler "flip this row back to queued" reading.
 */
export async function markPayoutFailed(payoutId: string, note: string): Promise<Result<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return err(admin.error.code, admin.error.message);
  }

  const parsed = markPayoutFailedInputSchema.safeParse({ payoutId, note });
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Enter a failure note.");
  }

  const service = createServiceClient();
  const { data: transitioned, error } = await service.rpc("mark_payout_failed", {
    p_payout_id: parsed.data.payoutId,
    p_note: parsed.data.note,
  });

  if (error || !transitioned || transitioned.length === 0) {
    return err("invalid_transition", "This payout isn't ready to be marked failed.");
  }

  // No admin-actor column exists for this on `payouts` (only `paid_by`) —
  // logged for audit purposes only, same posture as hideReview's reason.
  console.log("[markPayoutFailed]", { payoutId: parsed.data.payoutId, adminId: admin.data.adminId, note: parsed.data.note });

  return ok(undefined);
}
