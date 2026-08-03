import { describe, expect, it } from "vitest";
import { gymActivewearAttributesSchema } from "@/lib/categories/schemas/gym-activewear";

describe("gym/activewear attribute schema (new category, design/UX pass 2026-08-07)", () => {
  it("accepts a minimal listing — only condition and product_type required", () => {
    const result = gymActivewearAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "leggings",
    });
    expect(result.success).toBe(true);
  });

  it("defaults gender to unisex when omitted", () => {
    const result = gymActivewearAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "sports_bra",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.gender).toBe("unisex");
  });

  it("accepts every documented product_type", () => {
    const types = [
      "leggings",
      "sports_bra",
      "shorts",
      "tank_top",
      "jacket",
      "tracksuit",
      "gym_shoes",
      "socks",
      "set",
      "other",
    ];
    for (const product_type of types) {
      const result = gymActivewearAttributesSchema.safeParse({ condition: "brand_new", product_type });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown product_type", () => {
    const result = gymActivewearAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "swim_trunks",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional brand/size/colour/material together", () => {
    const result = gymActivewearAttributesSchema.safeParse({
      condition: "used",
      product_type: "tracksuit",
      gender: "mens",
      brand: "Nike",
      size: "L",
      colour: "Black",
      material: "Polyester",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown attribute key", () => {
    const result = gymActivewearAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "leggings",
      extra_field: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing product_type", () => {
    const result = gymActivewearAttributesSchema.safeParse({ condition: "brand_new" });
    expect(result.success).toBe(false);
  });
});
