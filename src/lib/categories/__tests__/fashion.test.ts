import { describe, expect, it } from "vitest";
import { fashionAttributesSchema } from "@/lib/categories/schemas/fashion";

describe("fashion attribute schema (PRD §6.4.2, restructured 2026-08-07)", () => {
  it("accepts a valid brand_new listing with a group, subtype, and single size field", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Zara",
      product_group: "dresses",
      size: "UK 10",
      colour: "Red",
      gender: "womens",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a listing with brand omitted — brand is now optional", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      product_group: "dresses",
      gender: "womens",
    });
    expect(result.success).toBe(true);
  });

  it("defaults gender to unisex when omitted — required but never a blocking blank state", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      product_group: "tops",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.gender).toBe("unisex");
  });

  it("accepts a group with a matching subtype (bottoms/jeans)", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      product_group: "bottoms",
      product_subtype: "jeans",
      gender: "mens",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a subtype that doesn't belong to the selected group", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      product_group: "tops",
      product_subtype: "jeans",
      gender: "mens",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "product_subtype")).toBe(true);
    }
  });

  it("rejects underwear listed as used", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      product_group: "other",
      product_subtype: "underwear",
      gender: "womens",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "condition")).toBe(true);
    }
  });

  it("rejects socks listed as used", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      product_group: "accessories",
      product_subtype: "socks",
      gender: "unisex",
    });
    expect(result.success).toBe(false);
  });

  it("accepts underwear as brand_new", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      product_group: "other",
      product_subtype: "underwear",
      gender: "womens",
    });
    expect(result.success).toBe(true);
  });

  it("no longer has times_worn_band/wear_signs at all — superseded by the generic listing-level Times worn/used field", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      product_group: "bottoms",
      product_subtype: "jeans",
      gender: "womens",
      times_worn_band: "2_to_5",
    });
    expect(result.success).toBe(false); // .strict() rejects the now-unknown key
  });

  it("accepts a used listing with no wear information at all — never forced", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      product_group: "bottoms",
      product_subtype: "jeans",
      gender: "womens",
    });
    expect(result.success).toBe(true);
  });

  it("rejects the old size_system/size_value pair as unknown keys", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      product_group: "dresses",
      gender: "womens",
      size_system: "uk",
      size_value: "10",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a free-text size value", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      product_group: "dresses",
      gender: "womens",
      size: "Large",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown attribute key", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      product_group: "dresses",
      gender: "womens",
      extra_field: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing product_group — required, unlike product_subtype", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      gender: "womens",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "product_group")).toBe(true);
    }
  });
});
