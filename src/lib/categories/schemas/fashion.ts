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
 * Two-level taxonomy (design/UX pass, 2026-08-07). Every one of the 20
 * pre-restructure `product_type` values maps somewhere in here. Four had no
 * clean fit in the requested 8-group list (suit, traditional, underwear,
 * swimwear) — see the inline notes; "Other" was added as a 9th group so
 * none of them become unlistable.
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
      // Added beyond the requested list — socks are conventionally an
      // accessory and had no other home.
      socks: "Socks",
    },
  },
  // Catch-all added beyond the requested 8 groups so nothing becomes
  // unlistable. Given explicit subtypes (not left bare) so old `underwear`
  // and `swimwear` keep the §6.4.2 "may not be listed as used" HARD RULE
  // enforceable, and so `traditional` (Nigerian traditional wear — a real,
  // likely significant category with no clean fit in an ASOS-style
  // taxonomy, worth a dedicated follow-up) is at least identifiable rather
  // than disappearing into an undifferentiated "Other".
  other: {
    label: "Other",
    subtypes: { underwear: "Underwear", swimwear: "Swimwear", traditional: "Traditional Wear" },
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
  "socks",
  "underwear",
  "swimwear",
  "traditional",
] as const;

/** §6.4.2 HARD RULE: underwear, swimwear, and socks may not be listed as `used`. */
const NO_USED_SUBTYPES: readonly string[] = ["underwear", "swimwear", "socks"];

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

  // §6.4.2 HARD RULE: underwear, swimwear, and socks may not be listed as
  // used, whenever the subtype is explicitly supplied. Known gap, same
  // shape as Beauty's hygiene-sensitivity note: since product_subtype is
  // optional, a seller can dodge this by picking the group (Other,
  // Accessories) without the specific subtype.
  if (data.condition === "used" && data.product_subtype !== undefined && NO_USED_SUBTYPES.includes(data.product_subtype)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["condition"],
      message: `${data.product_subtype} may not be listed as used (PRD §6.4.2).`,
    });
  }
});

export type FashionAttributes = z.infer<typeof fashionAttributesSchema>;
