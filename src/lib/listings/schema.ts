/**
 * Listing-level Zod schema. PRD §7.1 (title/description/price/photo bounds),
 * §6.3 (used requires condition_notes + wear-evidence photo).
 *
 * This validates the fields that live on `listings` directly, never in the
 * category `attributes` JSONB — title, description, price_kobo, photo_urls,
 * flaw_photo_indexes, condition_notes. Category-specific attributes and
 * `condition` membership are validated separately by
 * `resolveCategoryAttributes` (src/lib/categories/resolver.ts); this schema
 * does not re-validate `condition` against the category's allowed set, only
 * gates condition_notes/flaw_photo_indexes on it, so there is exactly one
 * place condition membership is decided.
 */
import { z } from "zod";
import type { CategoryConfig } from "@/lib/categories/registry";
import { isAllowedImageUrl } from "@/lib/images/allowed-hosts";

/**
 * §5.3: every photo URL must resolve to a host next/image is actually
 * configured to serve (src/lib/images/allowed-hosts.ts — the same allowlist
 * next.config.ts builds remotePatterns from). A listing photo pointing
 * anywhere else can never be saved through this schema — the only path
 * createListing/updateListing accept — closing the gap that let a
 * non-allowlisted host reach a rendered page at all and crash it (found
 * live, QA session 2026-07-30).
 */
const listingPhotoUrlSchema = z
  .string()
  .url()
  .refine(isAllowedImageUrl, "Photo URL must be hosted on an allowed image host.");

export function buildListingSubmissionSchema(category: CategoryConfig) {
  return z
    .object({
      title: z.string().trim().min(5, "Title must be at least 5 characters.").max(90),
      description: z
        .string()
        .trim()
        .min(20, "Description must be at least 20 characters.")
        .max(1500),
      priceKobo: z
        .number()
        .int()
        .min(50000, "Price must be at least ₦500.")
        .max(500000000),
      condition: z.string(),
      conditionNotes: z.string().trim().optional(),
      photoUrls: z
        .array(listingPhotoUrlSchema)
        .min(category.minPhotos, `At least ${category.minPhotos} photos are required for ${category.displayName}.`)
        .max(category.maxPhotos, `At most ${category.maxPhotos} photos are allowed.`),
      flawPhotoIndexes: z.array(z.number().int().min(0)).default([]),
    })
    .superRefine((data, ctx) => {
      // §6.3 HARD RULE: used requires condition_notes >= 20 chars, plus at
      // least one photo tagged as wear evidence.
      if (data.condition === "used") {
        if (!data.conditionNotes || data.conditionNotes.length < 20) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["conditionNotes"],
            message: "condition_notes must be at least 20 characters when condition is used.",
          });
        }
        if (data.flawPhotoIndexes.length < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["flawPhotoIndexes"],
            message: "At least one photo must be tagged as wear evidence when condition is used.",
          });
        }
      }

      data.flawPhotoIndexes.forEach((index, i) => {
        if (index >= data.photoUrls.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["flawPhotoIndexes", i],
            message: `flaw_photo_indexes[${i}] does not index a submitted photo.`,
          });
        }
      });
    });
}

export type ListingSubmissionInput = z.input<ReturnType<typeof buildListingSubmissionSchema>>;
