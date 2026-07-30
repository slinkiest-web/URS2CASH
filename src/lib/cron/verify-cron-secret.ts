import "server-only";
import crypto from "node:crypto";

/**
 * PRD §11.1 HARD RULE: "cron routes verify a secret header." Vercel Cron
 * automatically sends `Authorization: Bearer $CRON_SECRET` on every
 * cron-triggered request when the `CRON_SECRET` environment variable is
 * configured (Vercel's own documented convention — verified before
 * building this, not assumed) — this checks the request against that same
 * value. Constant-time comparison, same posture as the Paystack webhook
 * signature check (Prompt 14): this header is effectively a bearer
 * credential.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return false;

  const provided = request.headers.get("authorization");
  if (!provided) return false;

  const expected = `Bearer ${secret}`;
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}
