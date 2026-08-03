/**
 * Fashion category attribute schema. PRD §6.4.2, restructured to a
 * two-level group/subtype taxonomy plus several friction-removal changes
 * (design/UX pass, 2026-08-07 — see docs/DECISIONS.md for the full mapping
 * of every legacy `product_type` value into this structure).
 */
import { z } from "zod";
import { ALL_CONDITIONS } from "../shared";
import type { SubcategoryGroups } from "../registry";

export const SCHEMA_VERSION = 2;

export const FASHION_SLUG = "fashion" as const;
export const FASHION_ALLOWED_CONDITIONS = ALL_CONDITIONS;
export const FASHION_MIN_PHOTOS = 1;
/**
 * PRD §6.3's usage indicator set for this category — UI reveal-on-`used`,
 * not a validation source. Emptied (design/UX pass, 2026-08-07): the old
 * times_worn_band/wear_signs pair is gone, superseded by Stage 1's generic
 * listing-level "Times worn/used" field, which applies to every category
 * and isn't gated on condition at all.
 */
export const FASHION_USAGE_INDICATOR_FIELDS = [] as const;

/**
 * Two-level taxonomy (design/UX pass, 2026-08-07, swimwear/underwear/socks
 * removed entirely 2026-08-09 — this marketplace doesn't resell used
 * intimate/hygiene items). `suit`/`traditional` had no clean fit in the
 * requested 8-group list — see the inline notes; "Other" was added as a
 * 9th group so nothing becomes unlistable.
 */
export const FASHION_GROUPS = [
  "tops",
  "dresses",
  "bottoms",
  "outerwear",
  "sets",
  "shoes",
  "bags",
  "accessories",
  "other",
] as const;
export type FashionGroup = (typeof FASHION_GROUPS)[number];

export const FASHION_SUBCATEGORY_GROUPS: SubcategoryGroups = {
  tops: { label: "Tops", subtypes: { shirts: "Shirts", blouses: "Blouses", tees: "Tees" } },
  // Old `top` maps here with no specific subtype selected (subtype is optional).
  dresses: { label: "Dresses", subtypes: {} },
  bottoms: {
    label: "Bottoms",
    subtypes: { trousers: "Trousers", skirts: "Skirts", shorts: "Shorts", jeans: "Jeans" },
  },
  outerwear: { label: "Outerwear", subtypes: { jackets: "Jackets", coats: "Coats" } },
  // A suit is itself a matching set (jacket + trousers) — old `suit` lands here.
  sets: { label: "Sets", subtypes: {} },
  shoes: { label: "Shoes", subtypes: {} },
  bags: { label: "Bags", subtypes: {} },
  accessories: {
    label: "Accessories",
    subtypes: {
      belts: "Belts",
      jewellery: "Jewellery",
      scarves: "Scarves",
      hats: "Hats",
      watches: "Watches",
    },
  },
  // Catch-all added beyond the requested 8 groups so nothing becomes
  // unlistable. `traditional` (Nigerian traditional wear) is at least
  // identifiable rather than disappearing into an undifferentiated
  // "Other" — pending a dedicated promotion to its own group.
  other: {
    label: "Other",
    subtypes: { traditional: "Traditional Wear" },
  },
};

/** Flattened for the Zod enum — every subtype key is unique across groups. */
export const FASHION_SUBTYPES = [
  "shirts",
  "blouses",
  "tees",
  "trousers",
  "skirts",
  "shorts",
  "jeans",
  "jackets",
  "coats",
  "belts",
  "jewellery",
  "scarves",
  "hats",
  "watches",
  "traditional",
] as const;

const fashionBaseSchema = z
  .object({
    condition: z.enum(FASHION_ALLOWED_CONDITIONS),
    // Made optional (design/UX pass, 2026-08-07) — was required.
    brand: z.string().trim().min(2).max(60).optional(),
    product_group: z.enum(FASHION_GROUPS),
    product_subtype: z.enum(FASHION_SUBTYPES).optional(),
    // Replaces the old size_system + size_value pair with one free-text
    // field — a Nigerian resale seller's "size" is often a label read off
    // the garment tag, not a value that cleanly resolves to one sizing
    // system (design/UX pass, 2026-08-07).
    size: z.string().trim().min(1).max(20).optional(),
    colour: z.string().trim().min(1).max(40).optional(),
    material: z.string().trim().max(60).optional(),
    // Required but defaults to unisex so the dropdown is never a blocking
    // blank state (design/UX pass, 2026-08-07) — a man filtering to "Men"
    // never sees a womens-tagged listing and vice versa; an unlabelled
    // seller's item defaults to showing under both.
    gender: z.enum(["womens", "mens", "unisex", "kids"]).default("unisex"),
    measurements_cm: z
      .object({
        chest: z.number().positive().optional(),
        waist: z.number().positive().optional(),
        hips: z.number().positive().optional(),
        length: z.number().positive().optional(),
        inseam: z.number().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const fashionAttributesSchema = fashionBaseSchema.superRefine((data, ctx) => {
  // product_subtype, when supplied, must actually belong to the chosen group.
  if (data.product_subtype !== undefined) {
    const validSubtypes = Object.keys(FASHION_SUBCATEGORY_GROUPS[data.product_group]?.subtypes ?? {});
    if (!validSubtypes.includes(data.product_subtype)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["product_subtype"],
        message: `${data.product_subtype} is not a subtype of ${data.product_group}.`,
      });
    }
  }

});

export type FashionAttributes = z.infer<typeof fashionAttributesSchema>;
