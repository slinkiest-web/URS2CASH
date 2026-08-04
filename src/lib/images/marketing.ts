/**
 * Curated marketing/decorative imagery (design/UX pass Stage 3, 2026-08-04).
 *
 * urs2cash-ui skill non-negotiable #2 requires real listing photography on
 * every PRODUCT surface (cards, galleries) — that is unchanged and unrelaxed
 * here. These nine images (public/images/marketing/) exist for a narrower,
 * explicitly product-owner-directed purpose instead: category hero bands,
 * nav thumbnails, and homepage showcase tiles fall back to one of these ONLY
 * when a category has no published listing photo yet (an empty-category
 * cold-start problem the skill's original "solid colour or typographic
 * treatment" fallback left looking bare), plus a couple of purely
 * decorative contexts (the auth split-screen) that were never product
 * photography to begin with. Never used on a listing card, gallery, or
 * anywhere a buyer could mistake one for a real item photo. See
 * docs/DECISIONS.md for the entry recording this as a deliberate,
 * documented exception, not a drift from the skill.
 */
import type { CategorySlug } from "@/lib/categories/registry";

/** Category hero / nav-thumbnail / showcase-tile fallback, only categories with a curated image. */
export const CATEGORY_MARKETING_IMAGE: Partial<Record<CategorySlug, string>> = {
  beauty: "/images/marketing/beauty.jpg",
  fashion: "/images/marketing/fashion.jpg",
  gadgets: "/images/marketing/gadgets.jpg",
};

/** Fashion category hero + gender-filter avatar, swapped by the selected gender filter. */
export const FASHION_GENDER_MARKETING_IMAGE: Record<"mens" | "womens", string> = {
  mens: "/images/marketing/male-fashion.jpg",
  womens: "/images/marketing/fashion.jpg",
};

/** Beauty subcategory-group showcase tiles — only the three groups a real photo exists for. */
const BEAUTY_GROUP_MARKETING_IMAGE: Partial<Record<string, string>> = {
  face: "/images/marketing/powder.jpg",
  lips: "/images/marketing/lip-category.jpg",
  eyes: "/images/marketing/mascara-category.jpg",
};

/**
 * Per-category subcategory-group image map, keyed by slug so the category
 * page can look this up generically (never a per-category branch) — a
 * category with no curated group photography simply has no entry here, and
 * the group-image strip renders nothing for it.
 */
export const SUBCATEGORY_GROUP_MARKETING_IMAGE: Partial<Record<CategorySlug, Partial<Record<string, string>>>> = {
  beauty: BEAUTY_GROUP_MARKETING_IMAGE,
};

/** Sign in / sign up split-screen panel. */
export const AUTH_MARKETING_IMAGE = "/images/marketing/log-in.jpg";
