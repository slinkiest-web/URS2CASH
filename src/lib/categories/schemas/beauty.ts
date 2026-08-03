/**
 * Beauty category attribute schema. PRD §6.4.1, restructured to a two-level
 * group/subtype taxonomy (design/UX pass, 2026-08-07 — see
 * docs/DECISIONS.md for the full mapping of every legacy `product_type`
 * value into this structure).
 */
import { z } from "zod";
import { ALL_CONDITIONS, daysFromNow, isPastDate } from "../shared";
import type { SubcategoryGroups } from "../registry";

export const SCHEMA_VERSION = 2;

export const BEAUTY_SLUG = "beauty" as const;
export const BEAUTY_ALLOWED_CONDITIONS = ALL_CONDITIONS;
export const BEAUTY_MIN_PHOTOS = 1;
/** PRD §6.3's usage indicator set for this category — UI reveal-on-`used`, not a validation source. */
export const BEAUTY_USAGE_INDICATOR_FIELDS = ["fill_level_percent"] as const;

/**
 * Two-level taxonomy (design/UX pass, 2026-08-07). Every one of the 20
 * pre-restructure `product_type` values maps somewhere in here — see the
 * inline notes for the handful that needed a judgment call, not a literal
 * rename.
 */
export const BEAUTY_GROUPS = ["face", "lips", "eyes", "brushes_tools", "skincare", "other"] as const;
export type BeautyGroup = (typeof BEAUTY_GROUPS)[number];

export const BEAUTY_SUBCATEGORY_GROUPS: SubcategoryGroups = {
  face: {
    label: "Face",
    subtypes: {
      // Absorbs the old foundation_liquid + foundation_powder split.
      foundation: "Foundation",
      concealer: "Concealer",
      powder: "Powder",
      blush: "Blush",
      bronzer: "Bronzer",
      highlighter: "Highlighter",
      primer: "Primer",
      setting_spray: "Setting Spray",
    },
  },
  lips: {
    label: "Lips",
    subtypes: {
      lipstick: "Lipstick",
      gloss: "Gloss", // was lip_gloss
      liner: "Liner", // was lip_liner
    },
  },
  eyes: {
    label: "Eyes",
    subtypes: {
      // Absorbs the old liquid_eyeliner + pencil_eyeliner split.
      eyeliner: "Eyeliner",
      eyeshadow: "Eyeshadow", // was eyeshadow_palette
      mascara: "Mascara",
      brow: "Brow",
    },
  },
  brushes_tools: {
    label: "Brushes & Tools",
    subtypes: {
      brushes: "Brushes", // was brush
      sponges_blenders: "Sponges/Beauty Blenders", // was sponge
      // Old `tool` has no specific subtype home — maps to this group with
      // no subtype selected, which is valid since subtype is optional.
    },
  },
  skincare: {
    label: "Skincare",
    subtypes: {
      cleanser: "Cleanser",
      moisturizer: "Moisturizer",
      serum: "Serum",
      toner: "Toner",
      sunscreen: "Sunscreen",
      mask: "Mask",
    },
  },
  // Catch-all added beyond the requested 7 buckets so nothing becomes
  // unlistable (design/UX pass, 2026-08-07) — absorbs old `other`, and is
  // where `tool` lands too if a seller doesn't want Brushes & Tools.
  other: { label: "Other", subtypes: {} },
};

/** Flattened for the Zod enum — every subtype key is unique across groups. */
export const BEAUTY_SUBTYPES = [
  "foundation",
  "concealer",
  "powder",
  "blush",
  "bronzer",
  "highlighter",
  "primer",
  "setting_spray",
  "lipstick",
  "gloss",
  "liner",
  "eyeliner",
  "eyeshadow",
  "mascara",
  "brow",
  "brushes",
  "sponges_blenders",
  "cleanser",
  "moisturizer",
  "serum",
  "toner",
  "sunscreen",
  "mask",
] as const;

/**
 * §6.4.1 HARD RULE, remapped: hygiene-sensitive subcategories accept
 * brand_new/opened_unused only. Originally keyed on the specific liquid
 * formats (liquid formulas breed bacteria; powder/pencil don't) — merging
 * liquid+powder foundation into one "foundation" subtype and liquid+pencil
 * eyeliner into one "eyeliner" subtype means that distinction can no longer
 * be expressed. Applied conservatively to the whole merged subtype (blocks
 * more than before, never less). Known gap: since product_subtype is
 * optional, a seller can dodge this by picking the group without the
 * specific subtype — flagged, not solved, here.
 */
const HYGIENE_SENSITIVE_SUBTYPES: readonly string[] = ["mascara", "eyeliner", "lipstick", "gloss", "foundation"];

const PAO_MONTHS = ["3", "6", "9", "12", "24", "36"] as const;

const beautyBaseSchema = z
  .object({
    condition: z.enum(BEAUTY_ALLOWED_CONDITIONS),
    brand: z.string().trim().min(2).max(60),
    product_group: z.enum(BEAUTY_GROUPS),
    product_subtype: z.enum(BEAUTY_SUBTYPES).optional(),
    shade: z.string().trim().max(60).optional(),
    size_value: z.number().positive().optional(),
    size_unit: z.enum(["ml", "g", "oz"]).optional(),
    // Design/UX pass (2026-08-07): deliberately optional — the form asks
    // "Does it have an expiry date?" first and only shows this field on
    // "yes". Still validated (>=90 days out) whenever it is supplied.
    expiry_date: z.coerce.date().optional(),
    fill_level_percent: z.number().int().min(0).max(100).optional(),
    pao_months: z.enum(PAO_MONTHS).optional(),
    opened_at_date: z.coerce.date().optional(),
    batch_code: z.string().trim().max(40).optional(),
  })
  .strict();

export const beautyAttributesSchema = beautyBaseSchema.superRefine((data, ctx) => {
  // product_subtype, when supplied, must actually belong to the chosen group.
  if (data.product_subtype !== undefined) {
    const validSubtypes = Object.keys(BEAUTY_SUBCATEGORY_GROUPS[data.product_group]?.subtypes ?? {});
    if (!validSubtypes.includes(data.product_subtype)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["product_subtype"],
        message: `${data.product_subtype} is not a subtype of ${data.product_group}.`,
      });
    }
  }

  // §6.4.1 HARD RULE: hygiene-sensitive subcategories may not be listed as `used`.
  if (
    data.condition === "used" &&
    data.product_subtype !== undefined &&
    HYGIENE_SENSITIVE_SUBTYPES.includes(data.product_subtype)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["condition"],
      message: `${data.product_subtype} may not be listed as used (PRD §6.4.1).`,
    });
  }

  // §6.4.1: expiry_date must be a future date, minimum 90 days out, whenever
  // it's supplied — deliberately no longer required (design/UX pass,
  // 2026-08-07).
  if (data.expiry_date !== undefined && data.expiry_date.getTime() < daysFromNow(90).getTime()) {
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
