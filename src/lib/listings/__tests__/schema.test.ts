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

  it("rejects `used` without condition_notes", () => {
    const result = schema.safeParse(validPayload({ condition: "used", flawPhotoIndexes: [0] }));
    expect(result.success).toBe(false);
  });

  it("rejects `used` with condition_notes under 20 characters", () => {
    const result = schema.safeParse(
      validPayload({ condition: "used", conditionNotes: "too short", flawPhotoIndexes: [0] })
    );
    expect(result.success).toBe(false);
  });

  it("rejects `used` without at least one flaw photo index", () => {
    const result = schema.safeParse(
      validPayload({
        condition: "used",
        conditionNotes: "Some light wear on the cap, otherwise in good shape overall.",
        flawPhotoIndexes: [],
      })
    );
    expect(result.success).toBe(false);
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
