import { describe, expect, it } from "vitest";
import { homeGoodsAttributesSchema } from "@/lib/categories/schemas/home-goods";

describe("home goods attribute schema (PRD §6.4.5)", () => {
  it("accepts a valid brand_new, non-powered listing", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "decor",
      set_quantity: 1,
      is_powered: false,
      declared_weight_kg: 1,
      longest_dimension_cm: 20,
      is_fragile: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid used listing with wear_signs", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "used",
      product_type: "decor",
      set_quantity: 1,
      is_powered: false,
      wear_signs: ["light_scratches"],
      declared_weight_kg: 1,
      longest_dimension_cm: 20,
      is_fragile: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid powered listing with functional_status fully_functional", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "lamp",
      set_quantity: 1,
      is_powered: true,
      functional_status: "fully_functional",
      declared_weight_kg: 1,
      longest_dimension_cm: 30,
      is_fragile: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects cookware listed as used (food-contact)", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "used",
      product_type: "cookware",
      set_quantity: 1,
      is_powered: false,
      wear_signs: ["light_scratches"],
      declared_weight_kg: 1,
      longest_dimension_cm: 20,
      is_fragile: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "condition")).toBe(true);
    }
  });

  it("rejects bedding listed as used", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "used",
      product_type: "bedding",
      set_quantity: 1,
      is_powered: false,
      wear_signs: ["fading"],
      declared_weight_kg: 1,
      longest_dimension_cm: 20,
      is_fragile: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a powered item missing functional_status", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "small_appliance",
      set_quantity: 1,
      is_powered: true,
      declared_weight_kg: 1,
      longest_dimension_cm: 20,
      is_fragile: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "functional_status")).toBe(
        true
      );
    }
  });

  it("rejects a powered item with functional_status = faulty", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "lamp",
      set_quantity: 1,
      is_powered: true,
      functional_status: "faulty",
      declared_weight_kg: 1,
      longest_dimension_cm: 20,
      is_fragile: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a used listing missing wear_signs", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "used",
      product_type: "decor",
      set_quantity: 1,
      is_powered: false,
      declared_weight_kg: 1,
      longest_dimension_cm: 20,
      is_fragile: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects declared_weight_kg over the 10kg ceiling", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "decor",
      set_quantity: 1,
      is_powered: false,
      declared_weight_kg: 11,
      longest_dimension_cm: 20,
      is_fragile: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects longest_dimension_cm over the 60cm ceiling", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "decor",
      set_quantity: 1,
      is_powered: false,
      declared_weight_kg: 1,
      longest_dimension_cm: 65,
      is_fragile: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown attribute key", () => {
    const result = homeGoodsAttributesSchema.safeParse({
      condition: "brand_new",
      product_type: "decor",
      set_quantity: 1,
      is_powered: false,
      declared_weight_kg: 1,
      longest_dimension_cm: 20,
      is_fragile: false,
      not_a_real_field: "x",
    });
    expect(result.success).toBe(false);
  });
});
