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
  beautyAttributesSchema,
  SCHEMA_VERSION as BEAUTY_SCHEMA_VERSION,
} from "./schemas/beauty";
import {
  FASHION_SLUG,
  FASHION_ALLOWED_CONDITIONS,
  FASHION_MIN_PHOTOS,
  FASHION_USAGE_INDICATOR_FIELDS,
  fashionAttributesSchema,
  SCHEMA_VERSION as FASHION_SCHEMA_VERSION,
} from "./schemas/fashion";
import {
  GADGETS_SLUG,
  GADGETS_ALLOWED_CONDITIONS,
  GADGETS_MIN_PHOTOS,
  GADGETS_USAGE_INDICATOR_FIELDS,
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
  | typeof HOME_GOODS_SLUG;

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
  },
  [FASHION_SLUG]: {
    slug: FASHION_SLUG,
    displayName: "Fashion",
    listable: true,
    browsable: false,
    minPhotos: FASHION_MIN_PHOTOS,
    maxPhotos: MAX_PHOTOS,
    allowedConditions: FASHION_ALLOWED_CONDITIONS,
    schema: fashionAttributesSchema,
    schemaVersion: FASHION_SCHEMA_VERSION,
    usageIndicatorFields: FASHION_USAGE_INDICATOR_FIELDS,
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
  },
};

export const CATEGORY_SLUGS = Object.keys(categoryRegistry) as CategorySlug[];
