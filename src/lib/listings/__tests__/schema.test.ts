import { describe, expect, it } from "vitest";
import { buildListingSubmissionSchema } from "@/lib/listings/schema";
import { categoryRegistry } from "@/lib/categories/registry";

const beauty = categoryRegistry.beauty; // minPhotos 3, maxPhotos 8

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Barely used lipstick",
    description: "A lovely lipstick, only swatched a couple of times, still mostly full.",
    priceKobo: 150000,
    condition: "brand_new",
    photoUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg", "https://example.com/c.jpg"],
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
    const result = schema.safeParse(
      validPayload({ photoUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"] })
    );
    expect(result.success).toBe(false);
  });

  it("rejects more than 8 photos", () => {
    const photoUrls = Array.from({ length: 9 }, (_, i) => `https://example.com/${i}.jpg`);
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
});
