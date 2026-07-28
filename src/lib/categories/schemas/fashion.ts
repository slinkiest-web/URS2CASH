/**
 * Fashion category attribute schema. PRD §6.4.2.
 */
import { z } from "zod";
import { ALL_CONDITIONS } from "../shared";

export const SCHEMA_VERSION = 1;

export const FASHION_SLUG = "fashion" as const;
export const FASHION_ALLOWED_CONDITIONS = ALL_CONDITIONS;
export const FASHION_MIN_PHOTOS = 4;
/** PRD §6.3's usage indicator set for this category — UI reveal-on-`used`, not a validation source. */
export const FASHION_USAGE_INDICATOR_FIELDS = ["times_worn_band", "wear_signs"] as const;

export const FASHION_PRODUCT_TYPES = [
  "dress",
  "top",
  "trousers",
  "jeans",
  "skirt",
  "shorts",
  "jacket",
  "coat",
  "suit",
  "traditional",
  "shoes",
  "bag",
  "belt",
  "jewellery",
  "watch",
  "scarf",
  "hat",
  "underwear",
  "swimwear",
  "socks",
  "other",
] as const;

const WEAR_SIGNS = [
  "none",
  "slight_fading",
  "pilling",
  "stretched",
  "small_stain",
  "repaired",
  "missing_button",
  "sole_wear",
  "hardware_scratches",
] as const;

/** PRD §6.4.2 HARD RULE: underwear, swimwear, and socks may not be listed as `used`. */
const NO_USED_PRODUCT_TYPES: readonly string[] = ["underwear", "swimwear", "socks"];

const fashionBaseSchema = z
  .object({
    condition: z.enum(FASHION_ALLOWED_CONDITIONS),
    brand: z.string().trim().min(2).max(60),
    product_type: z.enum(FASHION_PRODUCT_TYPES),
    size_system: z.enum(["uk", "us", "eu", "intl_alpha", "nigeria_local"]),
    size_value: z.string().trim().min(1).max(12),
    colour: z.string().trim().min(1).max(40),
    material: z.string().trim().max(60).optional(),
    gender: z.enum(["womens", "mens", "unisex", "kids"]),
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
    times_worn_band: z.enum(["once", "2_to_5", "6_to_20", "over_20"]).optional(),
    wear_signs: z.array(z.enum(WEAR_SIGNS)).optional(),
  })
  .strict();

export const fashionAttributesSchema = fashionBaseSchema.superRefine((data, ctx) => {
  // §6.4.2 HARD RULE: underwear, swimwear, and socks may not be listed as used.
  if (data.condition === "used" && NO_USED_PRODUCT_TYPES.includes(data.product_type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["condition"],
      message: `${data.product_type} may not be listed as used (PRD §6.4.2).`,
    });
  }

  // §6.4.2 HARD RULE / §6.3: used requires times_worn_band and a non-empty wear_signs array.
  if (data.condition === "used") {
    if (data.times_worn_band === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["times_worn_band"],
        message: "times_worn_band is required when condition is used (PRD §6.4.2).",
      });
    }
    if (data.wear_signs === undefined || data.wear_signs.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["wear_signs"],
        message: "wear_signs must have at least 1 item when condition is used (PRD §6.4.2).",
      });
    }
  }
});

export type FashionAttributes = z.infer<typeof fashionAttributesSchema>;
