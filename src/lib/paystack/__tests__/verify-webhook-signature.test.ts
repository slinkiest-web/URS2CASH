import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyWebhookSignature } from "@/lib/paystack";

const SECRET = "sk_test_verification_only_not_a_real_key";

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha512", secret).update(body, "utf8").digest("hex");
}

describe("verifyWebhookSignature", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a signature genuinely computed from the same secret and body", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", SECRET);
    const body = JSON.stringify({ event: "charge.success", data: { id: 1, amount: 900000 } });
    expect(verifyWebhookSignature(body, sign(body, SECRET))).toBe(true);
  });

  it("§10 Epic D2 AC1: rejects a signature computed with the wrong secret", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", SECRET);
    const body = JSON.stringify({ event: "charge.success", data: { id: 1, amount: 900000 } });
    expect(verifyWebhookSignature(body, sign(body, "sk_test_a_different_secret"))).toBe(false);
  });

  it("rejects when the body has been altered after signing (byte-exact requirement)", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", SECRET);
    const originalBody = JSON.stringify({ event: "charge.success", data: { id: 1, amount: 900000 } });
    const signature = sign(originalBody, SECRET);
    const tamperedBody = JSON.stringify({ event: "charge.success", data: { id: 1, amount: 9000000 } });
    expect(verifyWebhookSignature(tamperedBody, signature)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", SECRET);
    const body = JSON.stringify({ event: "charge.success", data: { id: 1 } });
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });

  it("rejects a malformed (non-hex, wrong-length) signature header without throwing", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", SECRET);
    const body = JSON.stringify({ event: "charge.success", data: { id: 1 } });
    expect(() => verifyWebhookSignature(body, "not-a-real-signature")).not.toThrow();
    expect(verifyWebhookSignature(body, "not-a-real-signature")).toBe(false);
  });

  it("fails safe (rejects everything) when PAYSTACK_SECRET_KEY is unset, rather than skipping verification", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    const body = JSON.stringify({ event: "charge.success", data: { id: 1 } });
    expect(verifyWebhookSignature(body, sign(body, SECRET))).toBe(false);
  });
});
