import { describe, expect, it } from "vitest";
import { checkoutInputSchema } from "@/lib/orders/checkout-schema";

const validInput = {
  listingId: "00000000-0000-0000-0000-000000000001",
  deliveryName: "Ada Okafor",
  deliveryPhone: "+2348012345678",
  deliveryAddress: "12 Marina Road, Lagos Island",
  deliveryState: "Lagos",
};

describe("checkoutInputSchema", () => {
  it("accepts a fully valid submission", () => {
    expect(checkoutInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects a non-E.164 phone number", () => {
    const result = checkoutInputSchema.safeParse({ ...validInput, deliveryPhone: "08012345678" });
    expect(result.success).toBe(false);
  });

  it("rejects a state outside the 36 + FCT enum", () => {
    const result = checkoutInputSchema.safeParse({ ...validInput, deliveryState: "California" });
    expect(result.success).toBe(false);
  });

  it("rejects a too-short delivery address", () => {
    const result = checkoutInputSchema.safeParse({ ...validInput, deliveryAddress: "Lagos" });
    expect(result.success).toBe(false);
  });

  it("has no delivery_city field — the PRD's orders table has none (§7.1)", () => {
    expect("deliveryCity" in checkoutInputSchema.shape).toBe(false);
  });

  it("rejects a non-UUID listingId", () => {
    const result = checkoutInputSchema.safeParse({ ...validInput, listingId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
