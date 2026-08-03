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
      size: "UK 10",
      gender: "womens",
    });
    expect(result.success).toBe(true);
  });

  it("defaults gender to unisex when omitted — required but never a blocking blank state", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      product_group: "tops",
      size: "M",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.gender).toBe("unisex");
  });

  it("accepts a group with a matching subtype (trousers/jeans) — 'Bottoms' renamed to 'Trousers' 2026-08-09", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      product_group: "trousers",
      product_subtype: "jeans",
      size: "32",
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

  it("rejects underwear/swimwear/socks as unknown subtype keys — removed entirely 2026-08-09, this marketplace doesn't resell used intimate/hygiene items", () => {
    for (const product_subtype of ["underwear", "swimwear", "socks"]) {
      const result = fashionAttributesSchema.safeParse({
        condition: "brand_new",
        product_group: "other",
        product_subtype,
        gender: "womens",
      });
      expect(result.success).toBe(false);
    }
  });

  it("no longer has times_worn_band/wear_signs at all — superseded by the generic listing-level Times worn/used field", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      product_group: "trousers",
      product_subtype: "jeans",
      gender: "womens",
      times_worn_band: "2_to_5",
    });
    expect(result.success).toBe(false); // .strict() rejects the now-unknown key
  });

  it("accepts a used listing with no wear information at all — never forced", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      product_group: "trousers",
      product_subtype: "jeans",
      size: "32",
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

  it("accepts Tops with a jackets/coats subtype — Outerwear folded into Tops 2026-08-09", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      product_group: "tops",
      product_subtype: "jackets",
      size: "L",
      gender: "mens",
    });
    expect(result.success).toBe(true);
  });

  it("rejects outerwear as an unknown product_group — removed, folded into tops", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      product_group: "outerwear",
      gender: "mens",
    });
    expect(result.success).toBe(false);
  });

  it("accepts Traditional as its own top-level group with real subtypes", () => {
    for (const product_subtype of ["ankara", "agbada", "aso_ebi", "buba", "kaftan"]) {
      const result = fashionAttributesSchema.safeParse({
        condition: "brand_new",
        product_group: "traditional",
        product_subtype,
        size: "M",
        gender: "unisex",
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts Activewear (absorbed from the former standalone gym_activewear category, 2026-08-09) with its renamed subtypes", () => {
    for (const product_subtype of ["leggings", "sports_bra", "gym_shorts", "tank_top", "track_jacket", "tracksuit", "gym_shoes"]) {
      const result = fashionAttributesSchema.safeParse({
        condition: "brand_new",
        product_group: "activewear",
        product_subtype,
        size: "M",
        gender: "unisex",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects the old un-renamed gym subtype keys — shorts/jacket collide with Trousers/Tops, so they were renamed to gym_shorts/track_jacket", () => {
    for (const product_subtype of ["shorts_gym", "jacket"]) {
      const result = fashionAttributesSchema.safeParse({
        condition: "brand_new",
        product_group: "activewear",
        product_subtype,
        size: "M",
        gender: "unisex",
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects a missing size for every clothing group (design/UX pass, 2026-08-09) — size matters for buying clothes", () => {
    for (const product_group of ["tops", "dresses", "trousers", "sets", "activewear", "traditional"]) {
      const result = fashionAttributesSchema.safeParse({
        condition: "brand_new",
        product_group,
        gender: "unisex",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.join(".") === "size")).toBe(true);
      }
    }
  });

  it("does not require size for Bags/Accessories/Shoes/Other — doesn't apply the same way", () => {
    for (const product_group of ["bags", "accessories", "shoes", "other"]) {
      const result = fashionAttributesSchema.safeParse({
        condition: "brand_new",
        product_group,
        gender: "unisex",
      });
      expect(result.success).toBe(true);
    }
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
