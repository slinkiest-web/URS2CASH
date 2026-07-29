import { describe, expect, it } from "vitest";
import { inferReferrerSurface } from "../referrer-surface";

describe("inferReferrerSurface", () => {
  it("returns direct when there is no referer", () => {
    expect(inferReferrerSurface(null)).toBe("direct");
  });

  it("returns direct when the referer is not a valid URL", () => {
    expect(inferReferrerSurface("not-a-url")).toBe("direct");
  });

  it("returns home for the marketing home page", () => {
    expect(inferReferrerSurface("https://urs2cash.com/")).toBe("home");
  });

  it("returns category_page for a category browse page", () => {
    expect(inferReferrerSurface("https://urs2cash.com/c/beauty")).toBe("category_page");
  });

  it("returns search for the search page", () => {
    expect(inferReferrerSurface("https://urs2cash.com/search?q=jacket")).toBe("search");
  });

  it("returns seller_profile for a seller public profile page", () => {
    expect(inferReferrerSurface("https://urs2cash.com/s/some-handle")).toBe("seller_profile");
  });

  it("returns listing_detail when navigating from another listing", () => {
    expect(inferReferrerSurface("https://urs2cash.com/l/other-id")).toBe("listing_detail");
  });

  it("returns other for an unrecognised path", () => {
    expect(inferReferrerSurface("https://urs2cash.com/dashboard/profile")).toBe("other");
  });
});
