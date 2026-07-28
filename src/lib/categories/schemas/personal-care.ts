/**
 * Personal Care category attribute schema. PRD §6.4.4.
 *
 * HARD RULE (§6.4.4): `used` is not an available condition at all — it must
 * be structurally impossible to select. The `condition` field's enum below
 * contains only `brand_new` and `opened_unused`; there is no code path that
 * can widen it, since PRD §6.1 forbids category-specific logic outside the
 * registry/schema.
 */
import { z } from "zod";
import { daysFromNow, isPastDate } from "../shared";

export const SCHEMA_VERSION = 1;

export const PERSONAL_CARE_SLUG = "personal_care" as const;
export const PERSONAL_CARE_ALLOWED_CONDITIONS = ["brand_new", "opened_unused"] as const;
export const PERSONAL_CARE_MIN_PHOTOS = 3;
/** PRD §6.3: `used` is disallowed outright — no usage indicator set applies. */
export const PERSONAL_CARE_USAGE_INDICATOR_FIELDS = [] as const;

export const PERSONAL_CARE_PRODUCT_TYPES = [
  "cleanser",
  "moisturiser",
  "serum",
  "sunscreen",
  "body_lotion",
  "body_wash",
  "soap",
  "deodorant",
  "fragrance",
  "hair_shampoo",
  "hair_conditioner",
  "hair_treatment",
  "hair_styling",
  "hair_extension",
  "wig",
  "oral_care",
  "intimate_care",
  "shaving_blade",
  "shaving_other",
  "supplement",
  "tool",
  "other",
] as const;

/** PRD §6.4.4 HARD RULE: applied internally / to broken skin / intimate areas — brand_new only. */
const BRAND_NEW_ONLY_PRODUCT_TYPES: readonly string[] = [
  "oral_care",
  "intimate_care",
  "shaving_blade",
  "supplement",
];

const PAO_MONTHS = ["3", "6", "9", "12", "24", "36"] as const;

const personalCareBaseSchema = z
  .object({
    condition: z.enum(PERSONAL_CARE_ALLOWED_CONDITIONS),
    brand: z.string().trim().min(2).max(60),
    product_type: z.enum(PERSONAL_CARE_PRODUCT_TYPES),
    size_value: z.number().positive(),
    size_unit: z.enum(["ml", "l", "g", "kg", "oz"]),
    expiry_date: z.coerce.date(),
    fill_level_percent: z.number().int().min(0).max(100).optional(),
    pao_months: z.enum(PAO_MONTHS).optional(),
    opened_at_date: z.coerce.date().optional(),
    is_prescription: z.boolean(),
    skin_or_hair_type: z
      .enum([
        "all",
        "dry",
        "oily",
        "combination",
        "sensitive",
        "curly",
        "coily",
        "straight",
        "wavy",
      ])
      .optional(),
    key_ingredients: z.array(z.string().trim().max(40)).max(8).optional(),
    batch_code: z.string().trim().max(40).optional(),
  })
  .strict();

export const personalCareAttributesSchema = personalCareBaseSchema.superRefine((data, ctx) => {
  // §6.4.4 HARD RULE: internal/broken-skin/intimate-area products — brand_new only.
  if (data.condition !== "brand_new" && BRAND_NEW_ONLY_PRODUCT_TYPES.includes(data.product_type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["condition"],
      message: `${data.product_type} may only be listed as brand_new (PRD §6.4.4).`,
    });
  }

  // §6.4.4 HARD RULE: expiry_date must be at least 120 days in the future.
  if (data.expiry_date.getTime() < daysFromNow(120).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiry_date"],
      message: "expiry_date must be at least 120 days in the future (PRD §6.4.4).",
    });
  }

  // §6.4.4 HARD RULE: is_prescription must be false to publish.
  if (data.is_prescription) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["is_prescription"],
      message: "Prescription products cannot be listed (PRD §6.4.4).",
    });
  }

  // §6.4.4 HARD RULE: pao_months + opened_at_date required when opened_unused;
  // fill_level_percent must be exactly 100 — "unused means unused."
  if (data.condition === "opened_unused") {
    if (data.pao_months === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pao_months"],
        message: "pao_months is required when condition is opened_unused (PRD §6.4.4).",
      });
    }
    if (data.opened_at_date === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["opened_at_date"],
        message: "opened_at_date is required when condition is opened_unused (PRD §6.4.4).",
      });
    } else if (!isPastDate(data.opened_at_date)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["opened_at_date"],
        message: "opened_at_date must be in the past (PRD §6.4.4).",
      });
    }
    if (data.fill_level_percent !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fill_level_percent"],
        message: "fill_level_percent must be 100 when condition is opened_unused (PRD §6.4.4).",
      });
    }
  }
});

export type PersonalCareAttributes = z.infer<typeof personalCareAttributesSchema>;
