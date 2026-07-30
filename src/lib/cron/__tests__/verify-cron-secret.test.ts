import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedCronRequest } from "@/lib/cron/verify-cron-secret";

function requestWith(authHeader: string | null): Request {
  const headers = new Headers();
  if (authHeader !== null) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/cron/expire-pending-orders", { headers });
}

describe("isAuthorizedCronRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the exact Bearer-prefixed secret Vercel Cron sends", () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret-value");
    expect(isAuthorizedCronRequest(requestWith("Bearer test-cron-secret-value"))).toBe(true);
  });

  it("rejects a wrong secret", () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret-value");
    expect(isAuthorizedCronRequest(requestWith("Bearer wrong-value"))).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret-value");
    expect(isAuthorizedCronRequest(requestWith(null))).toBe(false);
  });

  it("rejects a header missing the Bearer prefix", () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret-value");
    expect(isAuthorizedCronRequest(requestWith("test-cron-secret-value"))).toBe(false);
  });

  it("fails safe when CRON_SECRET is unset", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorizedCronRequest(requestWith("Bearer anything"))).toBe(false);
  });
});
