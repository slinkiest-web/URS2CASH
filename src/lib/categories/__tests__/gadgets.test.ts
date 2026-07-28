import { describe, expect, it } from "vitest";
import { gadgetsAttributesSchema } from "@/lib/categories/schemas/gadgets";

const validPhone = {
  condition: "brand_new" as const,
  brand: "Apple",
  model: "iPhone 13",
  product_type: "phone" as const,
  storage_gb: 128,
  battery_health_percent: 100,
  functional_status: "fully_functional" as const,
  imei_last_6: "123456",
  icloud_or_frp_locked: false,
  carrier_locked: false,
  has_original_packaging: true,
  declared_weight_kg: 0.2,
  longest_dimension_cm: 15,
};

describe("gadgets attribute schema (PRD §6.4.3)", () => {
  it("accepts a valid brand_new phone", () => {
    const result = gadgetsAttributesSchema.safeParse(validPhone);
    expect(result.success).toBe(true);
  });

  it("accepts a valid used phone with cosmetic_grade and a non-cracked screen", () => {
    const result = gadgetsAttributesSchema.safeParse({
      ...validPhone,
      condition: "used",
      cosmetic_grade: "light_marks",
      screen_condition: "light_scratches",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a listing missing functional_status even when condition is brand_new", () => {
    const withoutFunctionalStatus: Record<string, unknown> = { ...validPhone };
    delete withoutFunctionalStatus["functional_status"];
    const result = gadgetsAttributesSchema.safeParse(withoutFunctionalStatus);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "functional_status")).toBe(
        true
      );
    }
  });

  it("rejects functional_status = faulty", () => {
    const result = gadgetsAttributesSchema.safeParse({
      ...validPhone,
      functional_status: "faulty",
    });
    expect(result.success).toBe(false);
  });

  it("rejects icloud_or_frp_locked = true for a phone", () => {
    const result = gadgetsAttributesSchema.safeParse({
      ...validPhone,
      icloud_or_frp_locked: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join(".") === "icloud_or_frp_locked")
      ).toBe(true);
    }
  });

  it("rejects a used phone with screen_condition = cracked", () => {
    const result = gadgetsAttributesSchema.safeParse({
      ...validPhone,
      condition: "used",
      cosmetic_grade: "visible_scratches",
      screen_condition: "cracked",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a phone missing imei_last_6", () => {
    const withoutImei: Record<string, unknown> = { ...validPhone };
    delete withoutImei["imei_last_6"];
    const result = gadgetsAttributesSchema.safeParse(withoutImei);
    expect(result.success).toBe(false);
  });

  it("rejects declared_weight_kg over the 5kg ceiling", () => {
    const result = gadgetsAttributesSchema.safeParse({
      ...validPhone,
      declared_weight_kg: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects longest_dimension_cm over the 50cm ceiling", () => {
    const result = gadgetsAttributesSchema.safeParse({
      ...validPhone,
      longest_dimension_cm: 60,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a used listing missing cosmetic_grade", () => {
    const result = gadgetsAttributesSchema.safeParse({
      ...validPhone,
      condition: "used",
      screen_condition: "light_scratches",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "cosmetic_grade")).toBe(true);
    }
  });

  it("rejects an unknown attribute key", () => {
    const result = gadgetsAttributesSchema.safeParse({
      ...validPhone,
      not_a_real_field: "x",
    });
    expect(result.success).toBe(false);
  });
});
