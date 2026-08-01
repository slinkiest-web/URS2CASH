/**
 * Home Goods category attribute schema. PRD §6.4.5.
 */
import { z } from "zod";
import { ALL_CONDITIONS } from "../shared";

export const SCHEMA_VERSION = 1;

export const HOME_GOODS_SLUG = "home_goods" as const;
export const HOME_GOODS_ALLOWED_CONDITIONS = ALL_CONDITIONS;
export const HOME_GOODS_MIN_PHOTOS = 1;
/**
 * PRD §6.3's usage indicator set for this category — UI reveal-on-`used`,
 * not a validation source. Excludes `functional_status`, which is gated on
 * `is_powered`, not `condition` — always rendered by the generic form.
 */
export const HOME_GOODS_USAGE_INDICATOR_FIELDS = ["wear_signs"] as const;

export const HOME_GOODS_PRODUCT_TYPES = [
  "cookware",
  "bakeware",
  "tableware",
  "drinkware",
  "cutlery",
  "food_storage",
  "small_appliance",
  "kitchen_tool",
  "bedding",
  "towel",
  "curtain",
  "rug_small",
  "lamp",
  "decor",
  "storage_basket",
  "cleaning_tool",
  "candle",
  "frame",
  "other",
] as const;

/** PRD §6.4.5 HARD RULE: food-contact items — brand_new/opened_unused only. */
const FOOD_CONTACT_PRODUCT_TYPES: readonly string[] = [
  "cookware",
  "bakeware",
  "tableware",
  "drinkware",
  "food_storage",
  "small_appliance",
];

/** PRD §6.4.5 HARD RULE: bedding and towels — brand_new/opened_unused only. */
const NO_USED_PRODUCT_TYPES: readonly string[] = ["bedding", "towel"];

const WEAR_SIGNS = [
  "none",
  "light_scratches",
  "visible_scratches",
  "chips",
  "fading",
  "staining",
  "dents",
  "repaired",
] as const;

const homeGoodsBaseSchema = z
  .object({
    condition: z.enum(HOME_GOODS_ALLOWED_CONDITIONS),
    brand: z.string().trim().max(60).optional(),
    product_type: z.enum(HOME_GOODS_PRODUCT_TYPES),
    material: z.string().trim().max(60).optional(),
    colour: z.string().trim().max(40).optional(),
    set_quantity: z.number().int().min(1).max(50),
    is_powered: z.boolean(),
    functional_status: z.enum(["fully_functional", "faulty"]).optional(),
    wear_signs: z.array(z.enum(WEAR_SIGNS)).optional(),
    declared_weight_kg: z.number().positive().max(10),
    longest_dimension_cm: z.number().positive().max(60),
    is_fragile: z.boolean(),
  })
  .strict();

export const homeGoodsAttributesSchema = homeGoodsBaseSchema.superRefine((data, ctx) => {
  // §6.4.5 HARD RULE: food-contact items may not be listed as used.
  if (data.condition === "used" && FOOD_CONTACT_PRODUCT_TYPES.includes(data.product_type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["condition"],
      message: `${data.product_type} may not be listed as used (PRD §6.4.5).`,
    });
  }

  // §6.4.5 HARD RULE: bedding and towels may not be listed as used.
  if (data.condition === "used" && NO_USED_PRODUCT_TYPES.includes(data.product_type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["condition"],
      message: `${data.product_type} may not be listed as used (PRD §6.4.5).`,
    });
  }

  // §6.4.5 HARD RULE: powered items require functional_status of
  // fully_functional, independent of condition — same two-claims rule as Gadgets.
  if (data.is_powered) {
    if (data.functional_status === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["functional_status"],
        message: "functional_status is required when is_powered is true (PRD §6.4.5).",
      });
    } else if (data.functional_status !== "fully_functional") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["functional_status"],
        message: "Powered items with faults cannot be listed (PRD §6.4.5).",
      });
    }
  }

  // §6.4.5 HARD RULE: used requires a non-empty wear_signs array.
  if (data.condition === "used" && (data.wear_signs === undefined || data.wear_signs.length < 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["wear_signs"],
      message: "wear_signs must have at least 1 item when condition is used (PRD §6.4.5).",
    });
  }
});

export type HomeGoodsAttributes = z.infer<typeof homeGoodsAttributesSchema>;
