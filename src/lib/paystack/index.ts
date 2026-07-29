/**
 * Paystack client utilities.
 *
 * Server-only. `PAYSTACK_SECRET_KEY` is read only in this module and never
 * returned to any caller — every function here returns Paystack's response
 * data, never the key itself. Do not import from client components; the
 * `server-only` import below makes that a build-time error.
 */
import "server-only";

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
 * the webhook (Prompt 14) can correlate the eventual `charge.success` event
 * back to this order. Paystack generates its own `reference`; the caller is
 * responsible for persisting it to `orders.paystack_reference`, not this
 * function (it has no database access — a pure API client).
 *
 * TODO(prompt 14): add `verify` (webhook cross-check, §10 Epic D2 AC4) and
 * `refund` (admin dispute resolution, Epic D5) helpers to this module.
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
