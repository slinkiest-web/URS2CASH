"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validation";
import { resolveBankAccount } from "@/lib/paystack";
import { NIGERIAN_BANKS } from "@/lib/paystack/banks";
import { type Result, ok, err } from "@/lib/result";
import type { Database } from "@/lib/database.types";

export type UpdateProfileInput = {
  displayName: string;
  bio?: string;
  phone?: string;
  state: string;
  avatarUrl?: string;
};

/**
 * Epic A3: complete/edit the seller profile. Self-update only — enforced
 * both by the `profiles_update_own` RLS policy and by re-checking the
 * session here (PRD §11.2: every server action re-checks authorisation).
 */
export async function updateProfileAction(
  input: UpdateProfileInput
): Promise<Result<void>> {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return err(
      "validation_error",
      issue?.message ?? "Check the highlighted fields.",
      issue?.path[0]?.toString()
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in to edit your profile.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      bio: parsed.data.bio || null,
      phone: parsed.data.phone || null,
      state: parsed.data.state,
      avatar_url: parsed.data.avatarUrl || null,
    })
    .eq("id", user.id);

  if (error) {
    return err("update_failed", "Could not save your profile. Try again.");
  }

  revalidatePath("/dashboard/profile");
  return ok(undefined);
}

const resolvePayoutAccountSchema = z.object({
  bankCode: z.enum(NIGERIAN_BANKS.map((b) => b.code) as [string, ...string[]], { message: "Choose a bank." }),
  accountNumber: z.string().regex(/^[0-9]{10}$/, "Enter a 10-digit account number."),
});

export type PayoutAccountSummary = Database["public"]["Tables"]["payout_accounts"]["Row"];

/**
 * PRD §11.2 / §10 Epic A3 AC3/AC4: resolveAndSavePayoutAccount(bankCode,
 * accountNumber): Result<PayoutAccount>. Resolves via the real Paystack
 * API and persists ONLY the name Paystack itself returned — there is no
 * code path here that accepts an `accountName` parameter from the caller
 * at all, which is what actually makes AC3's "fails if the account name is
 * accepted as user input" impossible to violate, not just a UI convention.
 *
 * A seller may only ever have one payout account in practice (no DB-level
 * UNIQUE on `payout_accounts.profile_id` yet — `docs/TODOS.md` #1, a
 * separately tracked gap not fixed here) — this action updates her
 * existing row if one exists rather than accumulating duplicates on every
 * re-save.
 */
export async function resolveAndSavePayoutAccount(bankCode: string, accountNumber: string): Promise<Result<PayoutAccountSummary>> {
  const parsed = resolvePayoutAccountSchema.safeParse({ bankCode, accountNumber });
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Check the bank details.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return err("not_authenticated", "Sign in to add a payout account.");
  }

  const resolved = await resolveBankAccount(parsed.data.bankCode, parsed.data.accountNumber);
  if (!resolved.ok) {
    return err("resolution_failed", resolved.error);
  }

  const bank = NIGERIAN_BANKS.find((b) => b.code === parsed.data.bankCode);
  if (!bank) {
    return err("invalid_input", "Choose a bank.");
  }

  const { data: existing } = await supabase.from("payout_accounts").select("id").eq("profile_id", user.id).maybeSingle();

  const row = {
    profile_id: user.id,
    bank_code: parsed.data.bankCode,
    bank_name: bank.name,
    account_number: parsed.data.accountNumber,
    account_name: resolved.accountName,
    is_verified: true,
  };

  const { data: saved, error } = existing
    ? await supabase.from("payout_accounts").update(row).eq("id", existing.id).select().single()
    : await supabase.from("payout_accounts").insert(row).select().single();

  if (error || !saved) {
    return err("save_failed", "Could not save your payout account. Try again.");
  }

  revalidatePath("/dashboard/profile");
  return ok(saved);
}
