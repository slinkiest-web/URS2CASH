import { describe, expect, it } from "vitest";
import { DISPUTE_REASONS, disputeInputSchema } from "@/lib/orders/dispute-schema";

const ALLOWED_PHOTO = "http://127.0.0.1:54321/storage/v1/object/public/listing-photos/seed/photo0.jpg";

const validInput = {
  orderId: "00000000-0000-0000-0000-000000000001",
  reason: "not_received" as const,
  detail: "The item never arrived after three weeks and the seller stopped responding.",
  evidenceUrls: [] as string[],
};

describe("disputeInputSchema", () => {
  it("accepts a fully valid submission", () => {
    expect(disputeInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("accepts all 7 reason enum values, including shipping_cost_dispute", () => {
    expect(DISPUTE_REASONS).toHaveLength(7);
    expect(DISPUTE_REASONS).toContain("shipping_cost_dispute");
    for (const reason of DISPUTE_REASONS) {
      expect(disputeInputSchema.safeParse({ ...validInput, reason }).success).toBe(true);
    }
  });

  it("rejects a reason outside the enum", () => {
    const result = disputeInputSchema.safeParse({ ...validInput, reason: "buyer_changed_mind" });
    expect(result.success).toBe(false);
  });

  it("rejects detail shorter than 20 characters", () => {
    const result = disputeInputSchema.safeParse({ ...validInput, detail: "Too short" });
    expect(result.success).toBe(false);
  });

  it("accepts detail at exactly 20 characters", () => {
    const result = disputeInputSchema.safeParse({ ...validInput, detail: "x".repeat(20) });
    expect(result.success).toBe(true);
  });

  it("rejects detail longer than 1000 characters", () => {
    const result = disputeInputSchema.safeParse({ ...validInput, detail: "x".repeat(1001) });
    expect(result.success).toBe(false);
  });

  it("accepts detail at exactly 1000 characters", () => {
    const result = disputeInputSchema.safeParse({ ...validInput, detail: "x".repeat(1000) });
    expect(result.success).toBe(true);
  });

  it("accepts up to 6 evidence photo URLs", () => {
    const result = disputeInputSchema.safeParse({ ...validInput, evidenceUrls: Array(6).fill(ALLOWED_PHOTO) });
    expect(result.success).toBe(true);
  });

  it("rejects 7 evidence photo URLs", () => {
    const result = disputeInputSchema.safeParse({ ...validInput, evidenceUrls: Array(7).fill(ALLOWED_PHOTO) });
    expect(result.success).toBe(false);
  });

  it("rejects an evidence photo URL from a non-allowlisted host — same crash class as Decision #66", () => {
    const result = disputeInputSchema.safeParse({
      ...validInput,
      evidenceUrls: ["https://example.com/evidence.jpg"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID orderId", () => {
    const result = disputeInputSchema.safeParse({ ...validInput, orderId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
