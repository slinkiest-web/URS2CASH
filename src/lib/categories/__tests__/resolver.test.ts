import { describe, expect, it } from "vitest";
import { resolveCategoryAttributes } from "@/lib/categories/resolver";
import { categoryRegistry, CATEGORY_SLUGS } from "@/lib/categories/registry";
import { daysFromNow } from "@/lib/categories/shared";

describe("category registry (PRD §6.4/§6.5)", () => {
  it("has exactly the five launch category slugs (Gym & Activewear merged into Fashion as its Activewear subcategory, 2026-08-09)", () => {
    expect(new Set(CATEGORY_SLUGS)).toEqual(
      new Set(["beauty", "fashion", "gadgets", "personal_care", "home_goods"])
    );
  });

  it("marks all five categories listable, and beauty/fashion browsable (Fashion flipped 2026-08-07)", () => {
    for (const slug of CATEGORY_SLUGS) {
      expect(categoryRegistry[slug].listable).toBe(true);
    }
    expect(categoryRegistry.beauty.browsable).toBe(true);
    expect(categoryRegistry.fashion.browsable).toBe(true);
    expect(categoryRegistry.gadgets.browsable).toBe(false);
    expect(categoryRegistry.personal_care.browsable).toBe(false);
    expect(categoryRegistry.home_goods.browsable).toBe(false);
  });

  it("requires only 1 photo minimum per category — deliberately relaxed below PRD §6.4's original 3-5 range for everyday-seller UX", () => {
    expect(categoryRegistry.beauty.minPhotos).toBe(1);
    expect(categoryRegistry.fashion.minPhotos).toBe(1);
    expect(categoryRegistry.gadgets.minPhotos).toBe(1);
    expect(categoryRegistry.personal_care.minPhotos).toBe(1);
    expect(categoryRegistry.home_goods.minPhotos).toBe(1);
  });

  it("excludes used from personal_care's allowed conditions", () => {
    expect(categoryRegistry.personal_care.allowedConditions).not.toContain("used");
  });

  it("gives beauty and fashion a subcategoryGroups taxonomy", () => {
    expect(categoryRegistry.beauty.subcategoryGroups).toBeDefined();
    expect(categoryRegistry.fashion.subcategoryGroups).toBeDefined();
  });

  it("ranks Fashion's Activewear group 2nd (top-3 prominence, per explicit instruction 2026-08-09)", () => {
    const groupKeys = Object.keys(categoryRegistry.fashion.subcategoryGroups ?? {});
    expect(groupKeys.indexOf("activewear")).toBeLessThan(3);
  });
});

describe("resolveCategoryAttributes", () => {
  it("returns an unknown_category error for an unregistered slug", () => {
    const result = resolveCategoryAttributes("furniture", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_category");
    }
  });

  it("resolves valid attributes for a known category", () => {
    const result = resolveCategoryAttributes("beauty", {
      condition: "brand_new",
      brand: "Fenty",
      product_group: "face",
      product_subtype: "foundation",
      expiry_date: daysFromNow(200).toISOString(),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown attribute key with a validation_error", () => {
    const result = resolveCategoryAttributes("beauty", {
      condition: "brand_new",
      brand: "Fenty",
      product_group: "face",
      product_subtype: "foundation",
      expiry_date: daysFromNow(200).toISOString(),
      not_a_real_field: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });

  it("resolves valid attributes for fashion's Activewear group (former standalone gym_activewear category)", () => {
    const result = resolveCategoryAttributes("fashion", {
      condition: "brand_new",
      product_group: "activewear",
      product_subtype: "leggings",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects condition = used for personal_care via the resolver", () => {
    const result = resolveCategoryAttributes("personal_care", {
      condition: "used",
      brand: "CeraVe",
      product_type: "cleanser",
      size_value: 200,
      size_unit: "ml",
      expiry_date: daysFromNow(200).toISOString(),
      is_prescription: false,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a gadgets object missing functional_status even when condition is brand_new", () => {
    const result = resolveCategoryAttributes("gadgets", {
      condition: "brand_new",
      brand: "Apple",
      model: "iPhone 13",
      product_type: "phone",
      storage_gb: 128,
      battery_health_percent: 100,
      imei_last_6: "123456",
      icloud_or_frp_locked: false,
      carrier_locked: false,
      has_original_packaging: true,
      declared_weight_kg: 0.2,
      longest_dimension_cm: 15,
    });
    expect(result.ok).toBe(false);
  });
});
