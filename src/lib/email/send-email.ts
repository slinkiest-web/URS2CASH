import "server-only";
import { Resend } from "resend";
import type { ReactElement } from "react";

export type SendEmailResult = { ok: true } | { ok: false; error: string };

/**
 * PRD §12.1: Resend + React Email. The one place `resend.emails.send()` is
 * called — every specific email in `src/lib/email/senders/` goes through
 * this. `react:` is passed straight to Resend, which renders it internally
 * via `@react-email/render` (already a transitive dependency of the
 * `resend` package).
 *
 * No-ops (logs and returns) when `RESEND_API_KEY` isn't set, same "not
 * configured" posture as `initializeTransaction`/`track()` — never throws,
 * never blocks the caller. Every sender function in this codebase treats a
 * failed send as best-effort: logged, never surfaced as the reason a
 * mutation itself fails (a bounced email must not roll back a payment or a
 * dispute resolution that already committed).
 */
export async function sendEmail(opts: { to: string; subject: string; react: ReactElement }): Promise<SendEmailResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.log("[email] RESEND_API_KEY not set — skipping send", { to: opts.to, subject: opts.subject });
    return { ok: false, error: "Email is not configured." };
  }

  const resend = new Resend(apiKey);
  const from = process.env["EMAIL_FROM"] ?? "Urs2Cash <notifications@urs2cash.com>";

  try {
    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      react: opts.react,
    });

    if (error) {
      console.error("[email] send failed", { to: opts.to, subject: opts.subject, error });
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error("[email] send threw", { to: opts.to, subject: opts.subject, error });
    return { ok: false, error: "Could not send email." };
  }
}
