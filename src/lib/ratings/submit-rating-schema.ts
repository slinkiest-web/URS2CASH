/**
 * submitRating input validation (PRD §10 Epic D6 AC2, §11.2 `submitRating`).
 * Mirrors the DB-level `ratings_score_range`/`ratings_review_length` CHECK
 * constraints (Prompt 5) — belt and suspenders, same pattern as every other
 * Zod-schema-plus-CHECK-constraint pair in this codebase.
 */
import { z } from "zod";

export const submitRatingInputSchema = z.object({
  orderId: z.string().uuid(),
  score: z.number().int().min(1, "Score must be between 1 and 5.").max(5, "Score must be between 1 and 5."),
  review: z
    .string()
    .trim()
    .max(500, "Review must be at most 500 characters.")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type SubmitRatingInput = z.infer<typeof submitRatingInputSchema>;
