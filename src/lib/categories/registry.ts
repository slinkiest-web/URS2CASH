/**
 * Category schema registry. PRD §6.5.
 *
 * HARD RULE: this is the single source of truth for photo minimums, allowed
 * conditions, and attribute validation. No `switch` statement over category
 * slug exists anywhere outside this file (PRD §12.3).
 */
import type { z } from "zod";
import {
  BEAUTY_SLUG,
  BEAUTY_ALLOWED_CONDITIONS,
  BEAUTY_MIN_PHOTOS,
  BEAUTY_USAGE_INDICATOR_FIELDS,
  BEAUTY_SUBCATEGORY_GROUPS,
  beautyAttributesSchema,
  SCHEMA_VERSION as BEAUTY_SCHEMA_VERSION,
} from "./schemas/beauty";
import {
  FASHION_SLUG,
  FASHION_ALLOWED_CONDITIONS,
  FASHION_MIN_PHOTOS,
  FASHION_USAGE_INDICATOR_FIELDS,
  FASHION_SUBCATEGORY_GROUPS,
  fashionAttributesSchema,
  SCHEMA_VERSION as FASHION_SCHEMA_VERSION,
} from "./schemas/fashion";
import {
  GYM_ACTIVEWEAR_SLUG,
  GYM_ACTIVEWEAR_ALLOWED_CONDITIONS,
  GYM_ACTIVEWEAR_MIN_PHOTOS,
  GYM_ACTIVEWEAR_USAGE_INDICATOR_FIELDS,
  gymActivewearAttributesSchema,
  SCHEMA_VERSION as GYM_ACTIVEWEAR_SCHEMA_VERSION,
} from "./schemas/gym-activewear";
import {
  GADGETS_SLUG,
  GADGETS_ALLOWED_CONDITIONS,
  GADGETS_MIN_PHOTOS,
  GADGETS_USAGE_INDICATOR_FIELDS,
  GADGETS_ADMIN_ONLY_ATTRIBUTE_FIELDS,
  gadgetsAttributesSchema,
  SCHEMA_VERSION as GADGETS_SCHEMA_VERSION,
} from "./schemas/gadgets";
import {
  PERSONAL_CARE_SLUG,
  PERSONAL_CARE_ALLOWED_CONDITIONS,
  PERSONAL_CARE_MIN_PHOTOS,
  PERSONAL_CARE_USAGE_INDICATOR_FIELDS,
  personalCareAttributesSchema,
  SCHEMA_VERSION as PERSONAL_CARE_SCHEMA_VERSION,
} from "./schemas/personal-care";
import {
  HOME_GOODS_SLUG,
  HOME_GOODS_ALLOWED_CONDITIONS,
  HOME_GOODS_MIN_PHOTOS,
  HOME_GOODS_USAGE_INDICATOR_FIELDS,
  homeGoodsAttributesSchema,
  SCHEMA_VERSION as HOME_GOODS_SCHEMA_VERSION,
} from "./schemas/home-goods";
import type { ConditionValue } from "./shared";

/**
 * PRD §7.1: `photo_urls` max is a single global cap (8), not a per-category
 * value — §6.4 only specifies per-category minimums. Not invented; sourced
 * from the `listings` table definition.
 */
export const MAX_PHOTOS = 8;

export type CategorySlug =
  | typeof BEAUTY_SLUG
  | typeof FASHION_SLUG
  | typeof GADGETS_SLUG
  | typeof PERSONAL_CARE_SLUG
  | typeof HOME_GOODS_SLUG
  | typeof GYM_ACTIVEWEAR_SLUG;

/**
 * A two-level subcategory group (design/UX pass, 2026-08-07 — Beauty and
 * Fashion both use this identical shape, no per-category switch). Keyed by
 * group key -> { label, subtypes: { subtypeKey -> label } }. `subtypes` is
 * `{}` for a group with no further breakdown (e.g. Beauty's "Other").
 */
export type SubcategoryGroups = Record<string, { label: string; subtypes: Record<string, string> }>;

export type CategoryConfig = {
  slug: CategorySlug;
  displayName: string;
  listable: boolean;
  browsable: boolean;
  minPhotos: number;
  maxPhotos: number;
  allowedConditions: readonly ConditionValue[];
  schema: z.ZodTypeAny;
  schemaVersion: number;
  /** PRD §6.3's usage indicator field names — UI reveal-on-`used` only. */
  usageIndicatorFields: readonly string[];
  /**
   * Attribute field names that must never reach a non-admin listing-detail
   * response (PRD §7.1/§9.1 — e.g. Gadgets' `imei_last_6`). Registry-driven
   * so the listing-detail query strips these generically, by name, rather
   * than a per-category switch (§12.3).
   */
  adminOnlyAttributeFields: readonly string[];
  /**
   * Present only for categories with a two-level group/subtype taxonomy
   * (Beauty, Fashion). Drives the sell form's group->subtype selector and
   * the category page's group tabs generically — both keyed off this data,
   * never off category slug.
   */
  subcategoryGroups?: SubcategoryGroups;
};

/** PRD §6.4: all five launch categories are `listable`; only Beauty is `browsable`. */
export const categoryRegistry: Record<CategorySlug, CategoryConfig> = {
  [BEAUTY_SLUG]: {
    slug: BEAUTY_SLUG,
    displayName: "Beauty",
    listable: true,
    browsable: true,
    minPhotos: BEAUTY_MIN_PHOTOS,
    maxPhotos: MAX_PHOTOS,
    allowedConditions: BEAUTY_ALLOWED_CONDITIONS,
    schema: beautyAttributesSchema,
    schemaVersion: BEAUTY_SCHEMA_VERSION,
    usageIndicatorFields: BEAUTY_USAGE_INDICATOR_FIELDS,
    adminOnlyAttributeFields: [],
    subcategoryGroups: BEAUTY_SUBCATEGORY_GROUPS,
  },
  [FASHION_SLUG]: {
    slug: FASHION_SLUG,
    displayName: "Fashion",
    listable: true,
    // Flipped true (design/UX pass, 2026-08-07) — was the deliberate
    // "opening soon" founding-seller state; also flipped in the DB seed/
    // migration so this stays true across a fresh `db reset`.
    browsable: true,
    minPhotos: FASHION_MIN_PHOTOS,
    maxPhotos: MAX_PHOTOS,
    allowedConditions: FASHION_ALLOWED_CONDITIONS,
    schema: fashionAttributesSchema,
    schemaVersion: FASHION_SCHEMA_VERSION,
    usageIndicatorFields: FASHION_USAGE_INDICATOR_FIELDS,
    adminOnlyAttributeFields: [],
    subcategoryGroups: FASHION_SUBCATEGORY_GROUPS,
  },
  [GADGETS_SLUG]: {
    slug: GADGETS_SLUG,
    displayName: "Gadgets",
    listable: true,
    browsable: false,
    minPhotos: GADGETS_MIN_PHOTOS,
    maxPhotos: MAX_PHOTOS,
    allowedConditions: GADGETS_ALLOWED_CONDITIONS,
    schema: gadgetsAttributesSchema,
    schemaVersion: GADGETS_SCHEMA_VERSION,
    usageIndicatorFields: GADGETS_USAGE_INDICATOR_FIELDS,
    adminOnlyAttributeFields: GADGETS_ADMIN_ONLY_ATTRIBUTE_FIELDS,
  },
  [PERSONAL_CARE_SLUG]: {
    slug: PERSONAL_CARE_SLUG,
    displayName: "Personal Care",
    listable: true,
    browsable: false,
    minPhotos: PERSONAL_CARE_MIN_PHOTOS,
    maxPhotos: MAX_PHOTOS,
    allowedConditions: PERSONAL_CARE_ALLOWED_CONDITIONS,
    schema: personalCareAttributesSchema,
    schemaVersion: PERSONAL_CARE_SCHEMA_VERSION,
    usageIndicatorFields: PERSONAL_CARE_USAGE_INDICATOR_FIELDS,
    adminOnlyAttributeFields: [],
  },
  [HOME_GOODS_SLUG]: {
    slug: HOME_GOODS_SLUG,
    displayName: "Home Goods",
    listable: true,
    browsable: false,
    minPhotos: HOME_GOODS_MIN_PHOTOS,
    maxPhotos: MAX_PHOTOS,
    allowedConditions: HOME_GOODS_ALLOWED_CONDITIONS,
    schema: homeGoodsAttributesSchema,
    schemaVersion: HOME_GOODS_SCHEMA_VERSION,
    usageIndicatorFields: HOME_GOODS_USAGE_INDICATOR_FIELDS,
    adminOnlyAttributeFields: [],
  },
  // New category (design/UX pass, 2026-08-07) — not PRD-sourced.
  [GYM_ACTIVEWEAR_SLUG]: {
    slug: GYM_ACTIVEWEAR_SLUG,
    displayName: "Gym & Activewear",
    listable: true,
    browsable: true,
    minPhotos: GYM_ACTIVEWEAR_MIN_PHOTOS,
    maxPhotos: MAX_PHOTOS,
    allowedConditions: GYM_ACTIVEWEAR_ALLOWED_CONDITIONS,
    schema: gymActivewearAttributesSchema,
    schemaVersion: GYM_ACTIVEWEAR_SCHEMA_VERSION,
    usageIndicatorFields: GYM_ACTIVEWEAR_USAGE_INDICATOR_FIELDS,
    adminOnlyAttributeFields: [],
  },
};

export const CATEGORY_SLUGS = Object.keys(categoryRegistry) as CategorySlug[];
