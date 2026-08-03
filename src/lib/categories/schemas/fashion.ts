/**
 * Fashion category attribute schema. PRD §6.4.2, restructured to a
 * two-level group/subtype taxonomy plus several friction-removal changes
 * (design/UX pass, 2026-08-07 — see docs/DECISIONS.md for the full mapping
 * of every legacy `product_type` value into this structure).
 */
import { z } from "zod";
import { ALL_CONDITIONS } from "../shared";
import type { SubcategoryGroups } from "../registry";

export const SCHEMA_VERSION = 3;

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
 * Two-level taxonomy (design/UX pass, 2026-08-07/09). "Outerwear" folded
 * into "Tops" (jackets/coats are now Tops subtypes), "Bottoms" renamed to
 * "Trousers" (kept as the group label per explicit instruction, even
 * though Skirts/Shorts still live under it), and "Traditional" (Nigerian
 * traditional wear) promoted from a buried Other-subtype to its own
 * top-level group with real subtypes. "Other" stays as a catch-all beyond
 * the requested list so nothing becomes unlistable.
 */
export const FASHION_GROUPS = [
  "tops",
  "dresses",
  "trousers",
  "sets",
  "shoes",
  "bags",
  "accessories",
  "traditional",
  "other",
] as const;
export type FashionGroup = (typeof FASHION_GROUPS)[number];

export const FASHION_SUBCATEGORY_GROUPS: SubcategoryGroups = {
  // Absorbs the old Outerwear group's jackets/coats.
  tops: { label: "Tops", subtypes: { shirts: "Shirts", blouses: "Blouses", tees: "Tees", jackets: "Jackets", coats: "Coats" } },
  dresses: { label: "Dresses", subtypes: {} },
  // Label renamed from "Bottoms" per explicit instruction — group key
  // renamed too (existing listings migrated in
  // 20260809090000_fashion_group_restructure.sql), not just re-labelled.
  trousers: {
    label: "Trousers",
    subtypes: { skirts: "Skirts", shorts: "Shorts", jeans: "Jeans" },
  },
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
  traditional: {
    label: "Traditional",
    subtypes: { ankara: "Ankara", agbada: "Agbada", aso_ebi: "Aso-ebi", buba: "Buba", kaftan: "Kaftan" },
  },
  // Catch-all added beyond the requested group list so nothing becomes
  // unlistable — the literal legacy `other` value, and anything genuinely
  // uncategorizable.
  other: { label: "Other", subtypes: {} },
};

/** Flattened for the Zod enum — every subtype key is unique across groups. */
export const FASHION_SUBTYPES = [
  "shirts",
  "blouses",
  "tees",
  "jackets",
  "coats",
  "skirts",
  "shorts",
  "jeans",
  "belts",
  "jewellery",
  "scarves",
  "hats",
  "watches",
  "ankara",
  "agbada",
  "aso_ebi",
  "buba",
  "kaftan",
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
