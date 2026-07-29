/**
 * Gadgets category attribute schema. PRD §6.4.3.
 */
import { z } from "zod";
import { ALL_CONDITIONS } from "../shared";

export const SCHEMA_VERSION = 1;

export const GADGETS_SLUG = "gadgets" as const;
export const GADGETS_ALLOWED_CONDITIONS = ALL_CONDITIONS;
export const GADGETS_MIN_PHOTOS = 5;
/**
 * PRD §6.3's usage indicator set for this category — UI reveal-on-`used`,
 * not a validation source. Excludes `battery_health_percent` and
 * `functional_status`, which §6.3's summary table lists alongside
 * `cosmetic_grade` but whose own §6.4.3 rules gate them on product_type and
 * "always", respectively — not on `condition` — so they're always rendered
 * by the generic form, never hidden.
 */
export const GADGETS_USAGE_INDICATOR_FIELDS = ["cosmetic_grade"] as const;
/**
 * PRD §7.1/§9.1: `imei_last_6` is buyer/seller-visible nowhere — it exists
 * only to let a moderator or the seller herself confirm device identity, not
 * for public listing display. Registry-driven so the listing-detail query
 * can strip admin-only attribute fields generically, by name, without a
 * per-category switch (docs/DECISIONS.md, Prompt 11).
 */
export const GADGETS_ADMIN_ONLY_ATTRIBUTE_FIELDS = ["imei_last_6"] as const;

export const GADGETS_PRODUCT_TYPES = [
  "phone",
  "tablet",
  "laptop",
  "smartwatch",
  "earbuds",
  "headphones",
  "speaker",
  "camera",
  "console",
  "game_controller",
  "power_bank",
  "charger",
  "cable",
  "router",
  "drone",
  "e_reader",
  "accessory",
  "other",
] as const;

// §6.4.3: each conditional field applies to a distinct set of product types —
// these lists are not interchangeable, keep them separate and precise.
const STORAGE_REQUIRED: readonly string[] = ["phone", "tablet", "laptop", "console"];
const RAM_REQUIRED: readonly string[] = ["laptop", "tablet"];
const BATTERY_REQUIRED: readonly string[] = ["phone", "tablet", "laptop", "earbuds"];
const IMEI_REQUIRED: readonly string[] = ["phone", "tablet"];
const ICLOUD_LOCK_REQUIRED: readonly string[] = ["phone", "tablet"];
const CARRIER_LOCK_REQUIRED: readonly string[] = ["phone"];
const SCREEN_CONDITION_APPLICABLE: readonly string[] = [
  "phone",
  "tablet",
  "laptop",
  "smartwatch",
  "e_reader",
];

const gadgetsBaseSchema = z
  .object({
    condition: z.enum(GADGETS_ALLOWED_CONDITIONS),
    brand: z.string().trim().min(2).max(60),
    model: z.string().trim().min(2).max(80),
    product_type: z.enum(GADGETS_PRODUCT_TYPES),
    storage_gb: z.number().int().positive().optional(),
    ram_gb: z.number().int().positive().optional(),
    colour: z.string().trim().max(40).optional(),
    // §6.4.3 HARD RULE, two claims rule: `faulty` is a legitimate literal so a
    // submitted faulty status is recognised and rejected with a clear message
    // below, not silently coerced into an unrelated validation failure.
    functional_status: z.enum(["fully_functional", "faulty"]),
    cosmetic_grade: z
      .enum(["pristine", "light_marks", "visible_scratches", "dents_or_cracks"])
      .optional(),
    screen_condition: z
      .enum(["flawless", "light_scratches", "deep_scratches", "cracked"])
      .optional(),
    battery_health_percent: z.number().int().min(0).max(100).optional(),
    imei_last_6: z
      .string()
      .regex(/^\d{6}$/, "imei_last_6 must be exactly 6 digits")
      .optional(),
    icloud_or_frp_locked: z.boolean().optional(),
    carrier_locked: z.boolean().optional(),
    has_original_packaging: z.boolean(),
    included_accessories: z.array(z.string().trim().max(40)).max(8).optional(),
    declared_weight_kg: z.number().positive().max(5),
    longest_dimension_cm: z.number().positive().max(50),
  })
  .strict();

export const gadgetsAttributesSchema = gadgetsBaseSchema.superRefine((data, ctx) => {
  // §6.4.3 HARD RULE: functional_status is required on every listing
  // regardless of condition, including brand_new, and must be
  // fully_functional to publish. `faulty` exists in the enum only so this
  // can reject and message clearly, never so a faulty device can publish.
  if (data.functional_status !== "fully_functional") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["functional_status"],
      message:
        "Devices with faults cannot be listed. Resubmit once fully functional (PRD §6.4.3).",
    });
  }

  // §6.4.3 HARD RULE: cosmetic_grade is required when condition is used.
  if (data.condition === "used" && data.cosmetic_grade === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cosmetic_grade"],
      message: "cosmetic_grade is required when condition is used (PRD §6.4.3).",
    });
  }

  // §6.4.3: screen_condition required for applicable product types when used; cracked blocks publish.
  if (SCREEN_CONDITION_APPLICABLE.includes(data.product_type) && data.condition === "used") {
    if (data.screen_condition === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["screen_condition"],
        message: `screen_condition is required for ${data.product_type} when condition is used (PRD §6.4.3).`,
      });
    } else if (data.screen_condition === "cracked") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["screen_condition"],
        message: "A cracked screen blocks publish (PRD §6.4.3).",
      });
    }
  }

  // §6.4.3: storage_gb required for phone, tablet, laptop, console.
  if (STORAGE_REQUIRED.includes(data.product_type) && data.storage_gb === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["storage_gb"],
      message: `storage_gb is required for ${data.product_type} (PRD §6.4.3).`,
    });
  }

  // §6.4.3: ram_gb required for laptop, tablet.
  if (RAM_REQUIRED.includes(data.product_type) && data.ram_gb === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ram_gb"],
      message: `ram_gb is required for ${data.product_type} (PRD §6.4.3).`,
    });
  }

  // §6.4.3: battery health required for phone, tablet, laptop, earbuds.
  if (BATTERY_REQUIRED.includes(data.product_type) && data.battery_health_percent === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["battery_health_percent"],
      message: `battery_health_percent is required for ${data.product_type} (PRD §6.4.3).`,
    });
  }

  // §6.4.3 HARD RULE: phones and tablets require imei_last_6 and a lock
  // status declaration; icloud_or_frp_locked must be false to publish.
  if (IMEI_REQUIRED.includes(data.product_type) && data.imei_last_6 === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["imei_last_6"],
      message: `imei_last_6 is required for ${data.product_type} (PRD §6.4.3).`,
    });
  }
  if (ICLOUD_LOCK_REQUIRED.includes(data.product_type)) {
    if (data.icloud_or_frp_locked === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["icloud_or_frp_locked"],
        message: `icloud_or_frp_locked is required for ${data.product_type} (PRD §6.4.3).`,
      });
    } else if (data.icloud_or_frp_locked === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["icloud_or_frp_locked"],
        message: "A device locked to iCloud/FRP cannot publish (PRD §6.4.3).",
      });
    }
  }

  // §6.4.3: carrier_locked required for phone.
  if (CARRIER_LOCK_REQUIRED.includes(data.product_type) && data.carrier_locked === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["carrier_locked"],
      message: `carrier_locked is required for ${data.product_type} (PRD §6.4.3).`,
    });
  }
});

export type GadgetsAttributes = z.infer<typeof gadgetsAttributesSchema>;
