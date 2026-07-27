/**
 * Money utilities (stub).
 *
 * HARD RULE (PRD §12.3): all money is integer kobo. This module owns every
 * conversion. No arithmetic on money outside this file.
 *
 * Implementation is filled in when the order/checkout flow is built.
 */

/** Convert naira (number) to kobo (integer). Throws if input is fractional after rounding. */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/** Convert kobo (integer) to a formatted naira string, e.g. "₦1,500.00" */
export function formatKobo(kobo: number): string {
  const naira = kobo / 100;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(naira);
}

/**
 * Compute commission.
 * HARD RULE (PRD §8.3): Math.floor(amount_kobo * 0.10).
 */
export function computeCommission(amountKobo: number): number {
  return Math.floor(amountKobo * 0.1);
}
