import { describe, expect, it } from "vitest";
import { computeCommission } from "@/lib/money";

describe("computeCommission", () => {
  it("computes exactly 10% for round amounts", () => {
    expect(computeCommission(100000)).toBe(10000);
    expect(computeCommission(50000)).toBe(5000);
  });

  it("§8.3 HARD RULE: floors, never rounds up — the fractional kobo stays with the seller", () => {
    // 100005 * 0.10 = 10000.5 — floor must land on 10000, not 10001.
    const amountKobo = 100005;
    const commissionKobo = computeCommission(amountKobo);
    expect(commissionKobo).toBe(10000);

    // seller_payout_kobo = amount_kobo - commission_kobo (never a separate
    // floor/ceil of its own) — the un-halvable extra kobo lands with the
    // seller, not the platform. "Commission rounding favours the seller."
    const sellerPayoutKobo = amountKobo - commissionKobo;
    expect(sellerPayoutKobo).toBe(90005);
    expect(commissionKobo + sellerPayoutKobo).toBe(amountKobo);
  });

  it("never exceeds a true 10% share, even when it can't divide evenly", () => {
    for (const amountKobo of [50000, 99999, 100001, 123457, 500000000]) {
      const commissionKobo = computeCommission(amountKobo);
      expect(commissionKobo).toBeLessThanOrEqual(amountKobo * 0.1);
      expect(Number.isInteger(commissionKobo)).toBe(true);
    }
  });
});
