import { describe, expect, it } from "vitest";
import { beautyAttributesSchema } from "@/lib/categories/schemas/beauty";
import { daysFromNow } from "@/lib/categories/shared";

const futureExpiry = () => daysFromNow(200).toISOString();
const pastOpenedAt = () => daysFromNow(-10).toISOString();

describe("beauty attribute schema (PRD §6.4.1, two-level group/subtype restructure 2026-08-07)", () => {
  it("accepts a valid brand_new listing with a group and subtype", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Fenty",
      product_group: "face",
      product_subtype: "foundation",
      expiry_date: futureExpiry(),
    });
    expect(result.success).toBe(true);
  });

  it("accepts a listing with only a group, no subtype at all — subtype is deliberately optional", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Fenty",
      product_group: "skincare",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a subtype that doesn't belong to the selected group", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Fenty",
      product_group: "lips",
      product_subtype: "mascara",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "product_subtype")).toBe(true);
    }
  });

  it("rejects a hygiene-sensitive subtype listed as used", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "used",
      brand: "Fenty",
      product_group: "eyes",
      product_subtype: "mascara",
      expiry_date: futureExpiry(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "condition")).toBe(true);
    }
  });

  it("still allows a non-hygiene-sensitive subtype in the same group (eyes/brow) to be listed as used", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "used",
      brand: "Fenty",
      product_group: "eyes",
      product_subtype: "brow",
      expiry_date: futureExpiry(),
    });
    expect(result.success).toBe(true);
  });

  it("known gap: a hygiene-sensitive group with no subtype selected is not blocked from used", () => {
    // Documented in schema comments — subtype is optional, so this is a
    // real, deliberate trade-off, not an oversight. Locked in by a test so
    // a future change here is a conscious decision, not an accident.
    const result = beautyAttributesSchema.safeParse({
      condition: "used",
      brand: "Fenty",
      product_group: "eyes",
      expiry_date: futureExpiry(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a subjective condition value", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "like_new",
      brand: "Fenty",
      product_group: "brushes_tools",
      product_subtype: "brushes",
      expiry_date: futureExpiry(),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a listing with no expiry_date at all — deliberately optional, gated behind a yes/no question in the UI (design/UX pass 2026-08-07)", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Fenty",
      product_group: "brushes_tools",
      product_subtype: "brushes",
    });
    expect(result.success).toBe(true);
  });

  it("rejects expiry_date less than 90 days out", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Fenty",
      product_group: "brushes_tools",
      product_subtype: "brushes",
      expiry_date: daysFromNow(30).toISOString(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "expiry_date")).toBe(true);
    }
  });

  it("accepts a used listing with no usage indicator fields — deliberately optional, not required (everyday-seller UX)", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "used",
      brand: "Fenty",
      product_group: "brushes_tools",
      product_subtype: "brushes",
      expiry_date: futureExpiry(),
    });
    expect(result.success).toBe(true);
  });

  it("accepts an opened_unused listing missing fill_level_percent — deliberately optional", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "opened_unused",
      brand: "Fenty",
      product_group: "brushes_tools",
      product_subtype: "brushes",
      expiry_date: futureExpiry(),
      pao_months: "12",
      opened_at_date: pastOpenedAt(),
    });
    expect(result.success).toBe(true);
  });

  it("still rejects a future opened_at_date, when supplied", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "used",
      brand: "Fenty",
      product_group: "brushes_tools",
      product_subtype: "brushes",
      expiry_date: futureExpiry(),
      opened_at_date: daysFromNow(10).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown attribute key", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Fenty",
      product_group: "brushes_tools",
      product_subtype: "brushes",
      expiry_date: futureExpiry(),
      not_a_real_field: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing product_group — required, unlike product_subtype", () => {
    const result = beautyAttributesSchema.safeParse({
      condition: "brand_new",
      brand: "Fenty",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "product_group")).toBe(true);
    }
  });
});
