import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedImageUrl } from "@/lib/images/allowed-hosts";

describe("isAllowedImageUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the local dev Storage host", () => {
    expect(isAllowedImageUrl("http://127.0.0.1:54321/storage/v1/object/public/listing-photos/seed/photo0.jpg")).toBe(
      true
    );
  });

  it("accepts a *.supabase.co subdomain", () => {
    expect(isAllowedImageUrl("https://abcxyz.supabase.co/storage/v1/object/public/listing-photos/x.jpg")).toBe(true);
  });

  it("rejects a bare supabase.co with no subdomain (wildcard must not match the apex)", () => {
    expect(isAllowedImageUrl("https://supabase.co/x.jpg")).toBe(false);
  });

  it("rejects an arbitrary external host — this is the exact case that 500'd the home page", () => {
    expect(isAllowedImageUrl("https://example.com/seed/photo0.jpg")).toBe(false);
  });

  it("rejects a malformed URL without throwing", () => {
    expect(() => isAllowedImageUrl("not a url")).not.toThrow();
    expect(isAllowedImageUrl("not a url")).toBe(false);
  });

  it("rejects a non-http(s) protocol", () => {
    expect(isAllowedImageUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedImageUrl("ftp://127.0.0.1/x.jpg")).toBe(false);
  });

  it("accepts whatever host NEXT_PUBLIC_SUPABASE_URL resolves to", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://custom-self-hosted.example.net");
    expect(isAllowedImageUrl("https://custom-self-hosted.example.net/storage/x.jpg")).toBe(true);
  });

  it("still rejects unrelated hosts even when NEXT_PUBLIC_SUPABASE_URL is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://custom-self-hosted.example.net");
    expect(isAllowedImageUrl("https://example.com/seed/photo0.jpg")).toBe(false);
  });
});
