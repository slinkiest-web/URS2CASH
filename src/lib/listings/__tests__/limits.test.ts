import { describe, expect, it } from "vitest";
import { computeListingLimit } from "@/lib/listings/limits";

describe("computeListingLimit (PRD §5.4)", () => {
  it("caps a new seller (0 sales) at 10", () => {
    expect(computeListingLimit(0, null)).toEqual({ tier: "new", cap: 10 });
  });

  it("caps an established seller (1-4 sales) at 50", () => {
    expect(computeListingLimit(1, null)).toEqual({ tier: "established", cap: 50 });
    expect(computeListingLimit(4, null)).toEqual({ tier: "established", cap: 50 });
  });

  it("has no cap for a trusted seller (5+ sales)", () => {
    expect(computeListingLimit(5, null)).toEqual({ tier: "trusted", cap: null });
    expect(computeListingLimit(100, null)).toEqual({ tier: "trusted", cap: null });
  });

  it("overrides the tier cap entirely when listing_limit_override is set", () => {
    expect(computeListingLimit(0, 200)).toEqual({ tier: "new", cap: 200 });
  });

  it("overrides even a trusted seller's unlimited cap when set", () => {
    expect(computeListingLimit(5, 3)).toEqual({ tier: "trusted", cap: 3 });
  });
});
