/**
 * raiseDispute input validation (PRD §10 Epic D5 AC2, §11.2 `raiseDispute`).
 *
 * The reason enum is exactly the 7 values PRD §10 Epic D5 AC2 names,
 * including `shipping_cost_dispute` (§8.4 HARD RULE: it exists as a dispute
 * reason code from launch, the measurement instrument for the no-shipping-fee
 * assumption — AC2b fails if it's omitted "on the grounds that shipping is
 * out of scope"). Mirrors the DB-level `disputes_reason_enum` CHECK
 * constraint (Prompt 5) — belt and suspenders, same pattern as every other
 * Zod-schema-plus-CHECK-constraint pair in this codebase.
 *
 * evidenceUrls is checked against the same allowlist as listing photos
 * (`isAllowedImageUrl`, Decision #66) — any future admin-facing render of
 * these URLs via next/image would hit the identical synchronous-throw crash
 * a non-allowlisted listing photo host already caused once.
 */
import { z } from "zod";
import { isAllowedImageUrl } from "@/lib/images/allowed-hosts";

export const DISPUTE_REASONS = [
  "not_received",
  "not_as_described",
  "damaged",
  "wrong_item",
  "counterfeit",
  "shipping_cost_dispute",
  "other",
] as const;

export const disputeInputSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.enum(DISPUTE_REASONS),
  detail: z
    .string()
    .trim()
    .min(20, "Enter at least 20 characters describing the issue.")
    .max(1000, "Detail must be at most 1000 characters."),
  evidenceUrls: z
    .array(z.string().url().refine(isAllowedImageUrl, "Photo URL is not from an allowed host."))
    .max(6, "Up to 6 evidence photos."),
});

export type DisputeInput = z.infer<typeof disputeInputSchema>;
