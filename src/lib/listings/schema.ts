/**
 * Listing-level Zod schema (title/description/price/photo bounds).
 *
 * This validates the fields that live on `listings` directly, never in the
 * category `attributes` JSONB — title, description, price_kobo, photo_urls,
 * flaw_photo_indexes, condition_notes, reason_for_selling, times_used.
 * Category-specific attributes and `condition` membership are validated
 * separately by `resolveCategoryAttributes` (src/lib/categories/resolver.ts).
 *
 * Design/UX pass (2026-08-07): only title, price, condition, and 1+ photo
 * are required to publish. Everything else here — description,
 * conditionNotes, reasonForSelling, timesUsed — is optional, with no
 * minimum length, and never gated on `condition`. "Does this item have any
 * flaws?" is an independent yes/no question in the UI; conditionNotes and
 * flawPhotoIndexes are how a "yes" answer gets recorded, not a requirement
 * that fires off `condition === "used"`.
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
      // Everyday-seller UX: no minimum. "Description" and the old, always
      // required "condition notes" concept are one free-text field now —
      // whether an item has flaws is a separate, independent, optional
      // question (the flawPhotoIndexes/conditionNotes pair below), never
      // coupled to `condition` and never blocking.
      description: z.string().trim().max(1500).optional().default(""),
      priceKobo: z
        .number()
        .int()
        .min(50000, "Price must be at least ₦500.")
        .max(500000000),
      condition: z.string(),
      // Repurposed: no longer gated on condition === "used". Populated only
      // when the seller opts into "Does this item have any flaws?" — always
      // optional, no minimum length, never required.
      conditionNotes: z.string().trim().max(1000).optional(),
      reasonForSelling: z.string().trim().max(500).optional(),
      timesUsed: z.string().trim().max(100).optional(),
      photoUrls: z
        .array(listingPhotoUrlSchema)
        .min(category.minPhotos, `At least ${category.minPhotos} photos are required for ${category.displayName}.`)
        .max(category.maxPhotos, `At most ${category.maxPhotos} photos are allowed.`),
      flawPhotoIndexes: z.array(z.number().int().min(0)).default([]),
    })
    .superRefine((data, ctx) => {
      // The only remaining cross-field rule: a tagged flaw photo index must
      // actually point at a submitted photo. Nothing here blocks on
      // condition or on flaws being present at all (see comments above).
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
