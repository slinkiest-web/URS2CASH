import { describe, expect, it } from "vitest";
import { fashionAttributesSchema } from "@/lib/categories/schemas/fashion";

describe("fashion attribute schema (PRD §6.4.2)", () => {
  it("accepts a valid brand_new listing", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Zara",
      product_type: "dress",
      size_system: "uk",
      size_value: "10",
      colour: "Red",
      gender: "womens",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid used listing with the usage indicator set", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      brand: "Levi's",
      product_type: "jeans",
      size_system: "uk",
      size_value: "10",
      colour: "Blue",
      gender: "womens",
      times_worn_band: "2_to_5",
      wear_signs: ["slight_fading"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts wear_signs of 'none' for a used listing", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      brand: "Levi's",
      product_type: "jeans",
      size_system: "uk",
      size_value: "10",
      colour: "Blue",
      gender: "womens",
      times_worn_band: "once",
      wear_signs: ["none"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects underwear listed as used", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      brand: "Calvin Klein",
      product_type: "underwear",
      size_system: "uk",
      size_value: "10",
      colour: "Black",
      gender: "womens",
      times_worn_band: "once",
      wear_signs: ["none"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "condition")).toBe(true);
    }
  });

  it("rejects a used listing missing times_worn_band and wear_signs", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      brand: "Levi's",
      product_type: "jeans",
      size_system: "uk",
      size_value: "10",
      colour: "Blue",
      gender: "womens",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("times_worn_band");
      expect(paths).toContain("wear_signs");
    }
  });

  it("rejects a used listing with an empty wear_signs array", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "used",
      brand: "Levi's",
      product_type: "jeans",
      size_system: "uk",
      size_value: "10",
      colour: "Blue",
      gender: "womens",
      times_worn_band: "once",
      wear_signs: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects free-text size (size_value must respect size_system, not be arbitrary text beyond 12 chars)", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Zara",
      product_type: "dress",
      size_system: "uk",
      size_value: "way too long a size string",
      colour: "Red",
      gender: "womens",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown attribute key", () => {
    const result = fashionAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Zara",
      product_type: "dress",
      size_system: "uk",
      size_value: "10",
      colour: "Red",
      gender: "womens",
      extra_field: true,
    });
    expect(result.success).toBe(false);
  });
});
