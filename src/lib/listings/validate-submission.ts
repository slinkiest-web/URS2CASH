/**
 * Shared listing validation, used by both `createListing` and `updateListing`
 * (src/lib/actions/listings.ts). §6.1: every write is fully re-validated —
 * there is no partially-valid persisted state, draft or published.
 */
import { categoryRegistry, type CategoryConfig, type CategorySlug } from "@/lib/categories/registry";
import { resolveCategoryAttributes } from "@/lib/categories/resolver";
import { buildListingSubmissionSchema } from "@/lib/listings/schema";

export type ListingSubmissionRaw = {
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
};

export type ValidatedListingSubmission = {
  categoryConfig: CategoryConfig;
  title: string;
  description: string;
  priceKobo: number;
  condition: string;
  conditionNotes: string | null;
  photoUrls: string[];
  flawPhotoIndexes: number[];
  /** condition already stripped out — category attrs only. */
  attributes: Record<string, unknown>;
};

export type ListingValidationResult =
  | { ok: true; data: ValidatedListingSubmission }
  | { ok: false; error: { code: string; message: string } };

function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(categoryRegistry, value);
}

export function validateListingSubmission(raw: ListingSubmissionRaw): ListingValidationResult {
  if (!isCategorySlug(raw.categorySlug) || !categoryRegistry[raw.categorySlug].listable) {
    return { ok: false, error: { code: "unknown_category", message: "Select a valid category." } };
  }

  const category = categoryRegistry[raw.categorySlug];

  // Listing-level fields — title/description/price/photos/condition_notes.
  const listingSchema = buildListingSubmissionSchema(category);
  const listingParsed = listingSchema.safeParse({
    title: raw.title,
    description: raw.description,
    priceKobo: raw.priceKobo,
    condition: raw.condition,
    conditionNotes: raw.conditionNotes,
    photoUrls: raw.photoUrls,
    flawPhotoIndexes: raw.flawPhotoIndexes ?? [],
  });

  // Category attributes + condition membership — the only validation path
  // for category-specific rules (§6.1/§6.4/§6.5). `condition` is bundled
  // into the raw payload because the category schemas' cross-field rules
  // (e.g. "used requires fill_level_percent") key off it.
  const attributesResult = resolveCategoryAttributes(raw.categorySlug, {
    condition: raw.condition,
    ...raw.attributes,
  });

  if (!listingParsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: listingParsed.error.issues[0]?.message ?? "Validation failed.",
      },
    };
  }

  if (!attributesResult.ok) {
    return { ok: false, error: { code: "validation_error", message: attributesResult.error.message } };
  }

  // condition → listings.condition (real column); everything else →
  // listings.attributes (JSONB) — per the resolver's documented split.
  const { condition, ...attributes } = attributesResult.data;

  return {
    ok: true,
    data: {
      categoryConfig: category,
      title: listingParsed.data.title,
      description: listingParsed.data.description,
      priceKobo: listingParsed.data.priceKobo,
      condition: condition as string, // each category schema types `condition` as a string enum
      conditionNotes: listingParsed.data.conditionNotes ?? null,
      photoUrls: listingParsed.data.photoUrls,
      flawPhotoIndexes: listingParsed.data.flawPhotoIndexes,
      attributes,
    },
  };
}
