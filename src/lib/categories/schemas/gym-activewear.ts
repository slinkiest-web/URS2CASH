/**
 * Gym/Activewear category attribute schema. New category, design/UX pass
 * (2026-08-07) — not PRD-sourced, built to the same shape/friction level as
 * the post-restructure Fashion schema (flat product_type, no two-level
 * grouping requested for this category).
 */
import { z } from "zod";
import { ALL_CONDITIONS } from "../shared";

export const SCHEMA_VERSION = 1;

export const GYM_ACTIVEWEAR_SLUG = "gym_activewear" as const;
export const GYM_ACTIVEWEAR_ALLOWED_CONDITIONS = ALL_CONDITIONS;
export const GYM_ACTIVEWEAR_MIN_PHOTOS = 1;
export const GYM_ACTIVEWEAR_USAGE_INDICATOR_FIELDS = [] as const;

// socks removed (design/UX pass, 2026-08-09) — this marketplace doesn't
// resell used intimate/hygiene items.
export const GYM_ACTIVEWEAR_PRODUCT_TYPES = [
  "leggings",
  "sports_bra",
  "shorts",
  "tank_top",
  "jacket",
  "tracksuit",
  "gym_shoes",
  "set",
  "other",
] as const;

const gymActivewearBaseSchema = z
  .object({
    condition: z.enum(GYM_ACTIVEWEAR_ALLOWED_CONDITIONS),
    product_type: z.enum(GYM_ACTIVEWEAR_PRODUCT_TYPES),
    // Required but defaults to unisex so the dropdown is never a blocking
    // blank state, same pattern as Fashion.
    gender: z.enum(["womens", "mens", "unisex", "kids"]).default("unisex"),
    brand: z.string().trim().min(2).max(60).optional(),
    size: z.string().trim().min(1).max(20).optional(),
    colour: z.string().trim().max(40).optional(),
    material: z.string().trim().max(60).optional(),
  })
  .strict();

export const gymActivewearAttributesSchema = gymActivewearBaseSchema;

export type GymActivewearAttributes = z.infer<typeof gymActivewearAttributesSchema>;
