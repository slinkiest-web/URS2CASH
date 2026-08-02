"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { type Result, ok, err } from "@/lib/result";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

/**
 * Footer newsletter signup (urs2cash-ui skill, Revision 4). Writes through
 * the service-role client since `newsletter_subscribers` has no anon SELECT
 * policy (write-only from the client's perspective) — the anon INSERT grant
 * alone is enough for the RLS-scoped anon/authenticated client too, but
 * routing through service-role here keeps the duplicate-email case a clean
 * `ok()` (see below) rather than surfacing a raw unique-constraint error.
 */
export async function subscribeToNewsletter(rawEmail: string): Promise<Result<void>> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return err("validation_error", parsed.error.issues[0]?.message ?? "Enter a valid email address.");
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("newsletter_subscribers").insert({ email: parsed.data });

  // A repeat signup from the same address is not an error from the user's
  // point of view, they're already on the list, which is what they wanted.
  if (error && error.code !== "23505") {
    return err("subscribe_failed", "That did not work. Check your connection and try again.");
  }

  return ok(undefined);
}
