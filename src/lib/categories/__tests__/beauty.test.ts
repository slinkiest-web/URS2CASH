import { describe, expect, it } from "vitest";
import { beautyAttributesSchema } from "@/lib/categories/schemas/beauty";
import { daysFromNow } from "@/lib/categories/shared";

const futureExpiry = () => daysFromNow(200).toISOString();
const pastOpenedAt = () => daysFromNow(-10).toISOString();

describe("beauty attribute schema (PRD §6.4.1)", () => {
  it("accepts a valid brand_new listing", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Fenty",
      product_type: "foundation_powder",
      expiry_date: futureExpiry(),
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid used listing with the usage indicator set", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "used",
      brand: "Fenty",
      product_type: "brush",
      expiry_date: futureExpiry(),
      fill_level_percent: 80,
      pao_months: "12",
      opened_at_date: pastOpenedAt(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a hygiene-sensitive product_type listed as used", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "used",
      brand: "Fenty",
      product_type: "mascara",
      expiry_date: futureExpiry(),
      fill_level_percent: 50,
      pao_months: "6",
      opened_at_date: pastOpenedAt(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "condition")).toBe(true);
    }
  });

  it("rejects a subjective condition value", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "like_new",
      brand: "Fenty",
      product_type: "brush",
      expiry_date: futureExpiry(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects expiry_date less than 90 days out", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Fenty",
      product_type: "brush",
      expiry_date: daysFromNow(30).toISOString(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "expiry_date")).toBe(true);
    }
  });

  it("rejects a used listing missing the usage indicator set", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "used",
      brand: "Fenty",
      product_type: "brush",
      expiry_date: futureExpiry(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("fill_level_percent");
      expect(paths).toContain("pao_months");
      expect(paths).toContain("opened_at_date");
    }
  });

  it("rejects an opened_unused listing missing fill_level_percent (required unless brand_new)", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "opened_unused",
      brand: "Fenty",
      product_type: "brush",
      expiry_date: futureExpiry(),
      pao_months: "12",
      opened_at_date: pastOpenedAt(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown attribute key", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Fenty",
      product_type: "brush",
      expiry_date: futureExpiry(),
      not_a_real_field: "x",
    });
    expect(result.success).toBe(false);
  });
});
