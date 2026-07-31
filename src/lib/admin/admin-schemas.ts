import { z } from "zod";

/**
 * PRD §10 Epic E1 AC6: "Personal Care skin lightening and prescription
 * violations are actionable takedown reasons in the reason list... must
 * exist in the UI" (§6.4.4's category policy). The admin UI's reason
 * `<select>` is built from this list; `suspendListing`'s `reason` column
 * itself stays free text (an admin can still type additional detail for
 * "other"), so this is UI-authoritative labels, not a DB enum.
 */
export const SUSPEND_LISTING_REASONS = [
  { value: "contact_details", label: "Contact details in listing text" },
  { value: "skin_lightening_or_bleaching", label: "Skin lightening or bleaching product (Personal Care policy, §6.4.4)" },
  { value: "prescription_violation", label: "Prescription-strength product without dispensing (Personal Care policy, §6.4.4)" },
  { value: "counterfeit_or_prohibited", label: "Counterfeit or prohibited item" },
  { value: "repeat_violation", label: "Repeat policy violation" },
  { value: "other", label: "Other" },
] as const;

const reasonSchema = z
  .string()
  .trim()
  .min(5, "Enter a reason of at least 5 characters.")
  .max(500, "Reason must be at most 500 characters.");

export const suspendListingInputSchema = z.object({
  listingId: z.string().uuid(),
  reason: reasonSchema,
});

export const suspendSellerInputSchema = z.object({
  profileId: z.string().uuid(),
  reason: reasonSchema,
});

export const dismissFlagInputSchema = z.object({
  flagId: z.string().uuid(),
});

export const setListingLimitOverrideInputSchema = z.object({
  profileId: z.string().uuid(),
  limit: z.number().int().min(0).max(100_000).nullable(),
});

export const hideReviewInputSchema = z.object({
  ratingId: z.string().uuid(),
  reason: reasonSchema,
});

/**
 * §10 Epic E2 AC4: "Both paths require admin_notes. AC4 fails if
 * resolution is possible without notes." No PRD-specified length bound
 * (unlike disputes.detail's 20-1000) — 10 chars is a reasonable floor
 * against a one-word non-answer, not a literal PRD number.
 */
/** §10 Epic E3 AC3: "Mark as paid requires admin_reference." */
export const markPayoutPaidInputSchema = z.object({
  payoutId: z.string().uuid(),
  reference: z
    .string()
    .trim()
    .min(3, "Enter a bank reference of at least 3 characters.")
    .max(200, "Reference must be at most 200 characters."),
});

/** §10 Epic E3 AC4: "Mark as failed requires failure_note." */
export const markPayoutFailedInputSchema = z.object({
  payoutId: z.string().uuid(),
  note: z
    .string()
    .trim()
    .min(5, "Enter a failure note of at least 5 characters.")
    .max(500, "Note must be at most 500 characters."),
});

export const resolveDisputeInputSchema = z.object({
  disputeId: z.string().uuid(),
  outcome: z.enum(["buyer", "seller"]),
  notes: z
    .string()
    .trim()
    .min(10, "Enter admin notes of at least 10 characters explaining the resolution.")
    .max(1000, "Notes must be at most 1000 characters."),
});
