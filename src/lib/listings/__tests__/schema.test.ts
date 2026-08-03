import { describe, expect, it } from "vitest";
import { buildListingSubmissionSchema } from "@/lib/listings/schema";
import { categoryRegistry } from "@/lib/categories/registry";

const beauty = categoryRegistry.beauty; // minPhotos 1, maxPhotos 8

const PHOTO_HOST = "http://127.0.0.1:54321/storage/v1/object/public/listing-photos";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Barely used lipstick",
    description: "A lovely lipstick, only swatched a couple of times, still mostly full.",
    priceKobo: 150000,
    condition: "brand_new",
    photoUrls: [`${PHOTO_HOST}/a.jpg`, `${PHOTO_HOST}/b.jpg`, `${PHOTO_HOST}/c.jpg`],
    flawPhotoIndexes: [],
    ...overrides,
  };
}

describe("buildListingSubmissionSchema (PRD §7.1/§6.3)", () => {
  const schema = buildListingSubmissionSchema(beauty);

  it("accepts a valid brand_new submission", () => {
    expect(schema.safeParse(validPayload()).success).toBe(true);
  });

  it("rejects a title under 5 characters", () => {
    expect(schema.safeParse(validPayload({ title: "Hi" })).success).toBe(false);
  });

  it("accepts a submission with no description at all — only title/price/condition/photo are required (design/UX pass 2026-08-07)", () => {
    const result = schema.safeParse(validPayload({ description: undefined }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe("");
  });

  it("accepts a short description — no minimum length anymore", () => {
    const result = schema.safeParse(validPayload({ description: "Cute." }));
    expect(result.success).toBe(true);
  });

  it("accepts optional reasonForSelling and timesUsed, general to every category", () => {
    const result = schema.safeParse(
      validPayload({ reasonForSelling: "No longer my shade", timesUsed: "worn_a_few_times" })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reasonForSelling).toBe("No longer my shade");
      expect(result.data.timesUsed).toBe("worn_a_few_times");
    }
  });

  it("rejects a free-text timesUsed value — replaced with a fixed 3-option dropdown (design/UX pass, 2026-08-09)", () => {
    const result = schema.safeParse(validPayload({ timesUsed: "Twice" }));
    expect(result.success).toBe(false);
  });

  it("rejects fewer photos than the category minimum", () => {
    const result = schema.safeParse(validPayload({ photoUrls: [] }));
    expect(result.success).toBe(false);
  });

  it("accepts a single photo — the minimum is 1, not 3+ (everyday-seller UX)", () => {
    const result = schema.safeParse(validPayload({ photoUrls: [`${PHOTO_HOST}/a.jpg`] }));
    expect(result.success).toBe(true);
  });

  it("rejects more than 8 photos", () => {
    const photoUrls = Array.from({ length: 9 }, (_, i) => `${PHOTO_HOST}/${i}.jpg`);
    expect(schema.safeParse(validPayload({ photoUrls })).success).toBe(false);
  });

  it("accepts `used` with no condition_notes and no flaw photo at all — flaws are optional, never gated on condition (design/UX pass 2026-08-07)", () => {
    const result = schema.safeParse(validPayload({ condition: "used", flawPhotoIndexes: [] }));
    expect(result.success).toBe(true);
  });

  it("accepts a short condition_notes — no minimum length anymore", () => {
    const result = schema.safeParse(
      validPayload({ condition: "used", conditionNotes: "too short", flawPhotoIndexes: [] })
    );
    expect(result.success).toBe(true);
  });

  it("accepts a brand_new listing with condition_notes and a tagged flaw photo — flaws are independent of condition", () => {
    const result = schema.safeParse(
      validPayload({
        condition: "brand_new",
        conditionNotes: "Tiny scuff on the box corner, item itself is untouched.",
        flawPhotoIndexes: [0],
      })
    );
    expect(result.success).toBe(true);
  });

  it("accepts a valid `used` submission with notes and a tagged flaw photo", () => {
    const result = schema.safeParse(
      validPayload({
        condition: "used",
        conditionNotes: "Some light wear on the cap, otherwise in good shape overall.",
        flawPhotoIndexes: [1],
      })
    );
    expect(result.success).toBe(true);
  });

  it("rejects a flaw photo index that doesn't point at a submitted photo", () => {
    const result = schema.safeParse(
      validPayload({
        condition: "used",
        conditionNotes: "Some light wear on the cap, otherwise in good shape overall.",
        flawPhotoIndexes: [99],
      })
    );
    expect(result.success).toBe(false);
  });

  // Regression: ISSUE-001 — a listing photo host outside next.config.ts's
  // next/image allowlist crashed the entire home page (next/image throws
  // synchronously on an unconfigured host, not a recoverable per-image
  // error). Found by /qa on 2026-07-30.
  // Report: .gstack/qa-reports/qa-report-full-purchase-journey-2026-07-30.md
  it("rejects a photo URL on a host outside the next/image allowlist", () => {
    const result = schema.safeParse(
      validPayload({ photoUrls: [`${PHOTO_HOST}/a.jpg`, `${PHOTO_HOST}/b.jpg`, "https://example.com/c.jpg"] })
    );
    expect(result.success).toBe(false);
  });
});
