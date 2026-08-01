/**
 * Beauty category attribute schema. PRD §6.4.1.
 */
import { z } from "zod";
import { ALL_CONDITIONS, daysFromNow, isPastDate } from "../shared";

export const SCHEMA_VERSION = 1;

export const BEAUTY_SLUG = "beauty" as const;
export const BEAUTY_ALLOWED_CONDITIONS = ALL_CONDITIONS;
export const BEAUTY_MIN_PHOTOS = 1;
/** PRD §6.3's usage indicator set for this category — UI reveal-on-`used`, not a validation source. */
export const BEAUTY_USAGE_INDICATOR_FIELDS = ["fill_level_percent"] as const;

export const BEAUTY_PRODUCT_TYPES = [
  "foundation_liquid",
  "foundation_powder",
  "concealer",
  "powder",
  "blush",
  "bronzer",
  "highlighter",
  "eyeshadow_palette",
  "mascara",
  "liquid_eyeliner",
  "pencil_eyeliner",
  "brow",
  "lipstick",
  "lip_gloss",
  "lip_liner",
  "setting_spray",
  "primer",
  "brush",
  "sponge",
  "tool",
  "other",
] as const;

/** PRD §6.4.1: hygiene-sensitive subcategories accept brand_new/opened_unused only. */
const HYGIENE_SENSITIVE_PRODUCT_TYPES: readonly string[] = [
  "mascara",
  "liquid_eyeliner",
  "lip_gloss",
  "lipstick",
  "foundation_liquid",
];

const PAO_MONTHS = ["3", "6", "9", "12", "24", "36"] as const;

const beautyBaseSchema = z
  .object({
    condition: z.enum(BEAUTY_ALLOWED_CONDITIONS),
    brand: z.string().trim().min(2).max(60),
    product_type: z.enum(BEAUTY_PRODUCT_TYPES),
    shade: z.string().trim().max(60).optional(),
    size_value: z.number().positive().optional(),
    size_unit: z.enum(["ml", "g", "oz"]).optional(),
    expiry_date: z.coerce.date(),
    fill_level_percent: z.number().int().min(0).max(100).optional(),
    pao_months: z.enum(PAO_MONTHS).optional(),
    opened_at_date: z.coerce.date().optional(),
    batch_code: z.string().trim().max(40).optional(),
  })
  .strict();

export const beautyAttributesSchema = beautyBaseSchema.superRefine((data, ctx) => {
  // §6.4.1 HARD RULE: hygiene-sensitive subcategories may not be listed as `used`.
  if (data.condition === "used" && HYGIENE_SENSITIVE_PRODUCT_TYPES.includes(data.product_type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["condition"],
      message: `${data.product_type} may not be listed as used (PRD §6.4.1).`,
    });
  }

  // §6.4.1 HARD RULE: expiry_date must be a future date, minimum 90 days out.
  if (data.expiry_date.getTime() < daysFromNow(90).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiry_date"],
      message: "expiry_date must be at least 90 days in the future (PRD §6.4.1).",
    });
  }

  // fill_level_percent/pao_months/opened_at_date used to be required unless
  // condition was brand_new (PRD §6.4.1) — deliberately relaxed to always
  // optional, a real everyday-seller UX barrier for a market where a used
  // item's exact PAO/opened date is often genuinely unknown. Still validated
  // when supplied: opened_at_date must be a real past date.
  if (data.opened_at_date !== undefined && !isPastDate(data.opened_at_date)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["opened_at_date"],
      message: "opened_at_date must be in the past (PRD §6.4.1).",
    });
  }
});

export type BeautyAttributes = z.infer<typeof beautyAttributesSchema>;
