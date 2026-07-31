/**
 * PRD §10 Epic A3 AC2: "Bank details are entered as bank select plus 10
 * digit account number." A static list rather than a live call to
 * Paystack's `GET /bank` endpoint on every profile-page render — bank
 * codes are stable, rarely-changing reference data (not paginated,
 * live-updating data), so fetching them live would add an external network
 * dependency to a page render for no benefit. Every code below was
 * verified against a real call to Paystack's own `/bank` endpoint before
 * being committed here, not typed from memory.
 */
export const NIGERIAN_BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "063", name: "Access Bank (Diamond)" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank" },
  { code: "058", name: "Guaranty Trust Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "50211", name: "Kuda Bank" },
  { code: "50515", name: "Moniepoint MFB" },
  { code: "999992", name: "OPay" },
  { code: "999991", name: "PalmPay" },
  { code: "076", name: "Polaris Bank" },
  { code: "101", name: "Providus Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "232", name: "Sterling Bank" },
  { code: "032", name: "Union Bank of Nigeria" },
  { code: "033", name: "United Bank For Africa" },
  { code: "215", name: "Unity Bank" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
] as const;
