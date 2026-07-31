import { describe, expect, it } from "vitest";
import { submitRatingInputSchema } from "@/lib/ratings/submit-rating-schema";

const validInput = {
  orderId: "00000000-0000-0000-0000-000000000001",
  score: 5,
};

describe("submitRatingInputSchema", () => {
  it("accepts a valid submission with no review", () => {
    const result = submitRatingInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.review).toBeUndefined();
  });

  it("accepts a valid submission with a review", () => {
    const result = submitRatingInputSchema.safeParse({ ...validInput, review: "Great seller, fast shipping." });
    expect(result.success).toBe(true);
  });

  it("accepts scores 1 through 5", () => {
    for (const score of [1, 2, 3, 4, 5]) {
      expect(submitRatingInputSchema.safeParse({ ...validInput, score }).success).toBe(true);
    }
  });

  it("rejects a score of 0", () => {
    expect(submitRatingInputSchema.safeParse({ ...validInput, score: 0 }).success).toBe(false);
  });

  it("rejects a score of 6", () => {
    expect(submitRatingInputSchema.safeParse({ ...validInput, score: 6 }).success).toBe(false);
  });

  it("rejects a non-integer score", () => {
    expect(submitRatingInputSchema.safeParse({ ...validInput, score: 3.5 }).success).toBe(false);
  });

  it("rejects a review longer than 500 characters", () => {
    const result = submitRatingInputSchema.safeParse({ ...validInput, review: "x".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts a review at exactly 500 characters", () => {
    const result = submitRatingInputSchema.safeParse({ ...validInput, review: "x".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("treats an empty-string review as no review", () => {
    const result = submitRatingInputSchema.safeParse({ ...validInput, review: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.review).toBeUndefined();
  });

  it("rejects a non-UUID orderId", () => {
    expect(submitRatingInputSchema.safeParse({ ...validInput, orderId: "not-a-uuid" }).success).toBe(false);
  });
});
