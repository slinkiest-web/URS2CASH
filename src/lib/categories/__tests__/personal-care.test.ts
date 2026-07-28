import { describe, expect, it } from "vitest";
import { personalCareAttributesSchema } from "@/lib/categories/schemas/personal-care";
import { daysFromNow } from "@/lib/categories/shared";

const futureExpiry = () => daysFromNow(200).toISOString();
const pastOpenedAt = () => daysFromNow(-10).toISOString();

describe("personal care attribute schema (PRD §6.4.4)", () => {
  it("accepts a valid brand_new listing", () => {
    const result = personalCareAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "CeraVe",
      product_type: "cleanser",
      size_value: 200,
      size_unit: "ml",
      expiry_date: futureExpiry(),
      is_prescription: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid opened_unused listing with PAO fields and fill_level_percent 100", () => {
    const result = personalCareAttributesSchema.safeParse({
      condition: "opened_unused",
      brand: "CeraVe",
      product_type: "cleanser",
      size_value: 200,
      size_unit: "ml",
      expiry_date: futureExpiry(),
      fill_level_percent: 100,
      pao_months: "12",
      opened_at_date: pastOpenedAt(),
      is_prescription: false,
    });
    expect(result.success).toBe(true);
  });

  it("structurally rejects condition = used", () => {
    const result = personalCareAttributesSchema.safeParse({
      condition: "used",
      brand: "CeraVe",
      product_type: "cleanser",
      size_value: 200,
      size_unit: "ml",
      expiry_date: futureExpiry(),
      is_prescription: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "condition")).toBe(true);
    }
  });

  it("rejects oral_care listed as opened_unused (brand_new only)", () => {
    const result = personalCareAttributesSchema.safeParse({
      condition: "opened_unused",
      brand: "Colgate",
      product_type: "oral_care",
      size_value: 100,
      size_unit: "ml",
      expiry_date: futureExpiry(),
      fill_level_percent: 100,
      pao_months: "6",
      opened_at_date: pastOpenedAt(),
      is_prescription: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "condition")).toBe(true);
    }
  });

  it("rejects is_prescription = true", () => {
    const result = personalCareAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "CeraVe",
      product_type: "cleanser",
      size_value: 200,
      size_unit: "ml",
      expiry_date: futureExpiry(),
      is_prescription: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects expiry_date less than 120 days out", () => {
    const result = personalCareAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "CeraVe",
      product_type: "cleanser",
      size_value: 200,
      size_unit: "ml",
      expiry_date: daysFromNow(100).toISOString(),
      is_prescription: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects opened_unused missing pao_months and opened_at_date", () => {
    const result = personalCareAttributesSchema.safeParse({
      condition: "opened_unused",
      brand: "CeraVe",
      product_type: "cleanser",
      size_value: 200,
      size_unit: "ml",
      expiry_date: futureExpiry(),
      fill_level_percent: 100,
      is_prescription: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("pao_months");
      expect(paths).toContain("opened_at_date");
    }
  });

  it("rejects opened_unused with fill_level_percent below 100", () => {
    const result = personalCareAttributesSchema.safeParse({
      condition: "opened_unused",
      brand: "CeraVe",
      product_type: "cleanser",
      size_value: 200,
      size_unit: "ml",
      expiry_date: futureExpiry(),
      fill_level_percent: 90,
      pao_months: "12",
      opened_at_date: pastOpenedAt(),
      is_prescription: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "fill_level_percent")).toBe(
        true
      );
    }
  });

  it("rejects an unknown attribute key", () => {
    const result = personalCareAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "CeraVe",
      product_type: "cleanser",
      size_value: 200,
      size_unit: "ml",
      expiry_date: futureExpiry(),
      is_prescription: false,
      not_a_real_field: "x",
    });
    expect(result.success).toBe(false);
  });
});
