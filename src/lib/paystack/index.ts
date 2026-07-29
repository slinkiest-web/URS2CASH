/**
 * Paystack client utilities.
 *
 * Server-only. `PAYSTACK_SECRET_KEY` is read only in this module and never
 * returned to any caller — every function here returns Paystack's response
 * data, never the key itself. Do not import from client components; the
 * `server-only` import below makes that a build-time error.
 */
import "server-only";
import crypto from "node:crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export type InitializeTransactionInput = {
  email: string;
  /** Integer kobo — Paystack's NGN `amount` parameter is already denominated in kobo, so this passes through with no conversion. */
  amountKobo: number;
  orderId: string;
  callbackUrl: string;
};

export type InitializeTransactionResult =
  | { ok: true; authorizationUrl: string; reference: string }
  | { ok: false; error: string };

/**
 * PRD §11.2 `initiateCheckout` / §10 Epic D1 AC6: calls Paystack's
 * `/transaction/initialize` server-side, with the order id in `metadata` so
 * the webhook (Prompt 14, `verifyWebhookSignature` below) can correlate the
 * eventual `charge.success` event back to this order. Paystack generates
 * its own `reference`; the caller is responsible for persisting it to
 * `orders.paystack_reference`, not this function (it has no database
 * access — a pure API client).
 *
 * TODO: `refund` (admin dispute resolution, Epic D5) belongs in this module
 * too, once Epic E's dispute arbitration is built.
 * TODO: `resolve-account` (Epic A3 AC3) belongs here too, once
 * `/api/paystack/resolve-account` is built.
 */
export async function initializeTransaction(
  input: InitializeTransactionInput
): Promise<InitializeTransactionResult> {
  const secretKey = process.env["PAYSTACK_SECRET_KEY"];
  if (!secretKey) {
    return { ok: false, error: "Payments are not configured." };
  }

  let response: Response;
  try {
    response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        callback_url: input.callbackUrl,
        metadata: { order_id: input.orderId },
      }),
    });
  } catch {
    return { ok: false, error: "Could not reach Paystack." };
  }

  const json = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  } | null;

  if (!response.ok || !json?.status || !json.data?.authorization_url || !json.data.reference) {
    return { ok: false, error: json?.message || "Paystack could not start this payment." };
  }

  return { ok: true, authorizationUrl: json.data.authorization_url, reference: json.data.reference };
}

/**
 * PRD §10 Epic D2 AC1: verifies the `x-paystack-signature` header against
 * the RAW request body — HMAC-SHA512, keyed with `PAYSTACK_SECRET_KEY`.
 * Paystack has no separate webhook-signing secret; the account's own secret
 * key is the HMAC key for both `initialize` auth and webhook signing (see
 * docs/DECISIONS.md #57 — confirmed against Paystack's own docs, not
 * assumed). The caller MUST pass the exact bytes Paystack sent
 * (`await request.text()`, never a re-serialized `JSON.stringify` of a
 * parsed body) — signing is byte-exact, and re-serialization can silently
 * produce a different string (key order, whitespace) that would make a
 * genuine signature fail to verify.
 *
 * Constant-time comparison (`crypto.timingSafeEqual`) to avoid a timing
 * side-channel on the signature check itself — this is the single most
 * security-sensitive comparison in the codebase (PRD's own framing for this
 * prompt), so it gets the careful version, not `===`.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secretKey = process.env["PAYSTACK_SECRET_KEY"];
  if (!secretKey || !signatureHeader) return false;

  const expectedHex = crypto.createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex");

  const expectedBuffer = Buffer.from(expectedHex, "hex");
  const providedBuffer = Buffer.from(signatureHeader, "hex");

  if (expectedBuffer.length !== providedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}
