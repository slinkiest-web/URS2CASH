"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authCredentialsSchema } from "@/lib/validation";
import { sanitizeRedirectPath } from "@/lib/safe-redirect";
import { track } from "@/lib/analytics/track-server";

export type AuthFormState = {
  error?: string;
  info?: string;
  /** Set when sign-in failed because the email is unconfirmed (Epic A1 AC3). */
  unconfirmedEmail?: string;
};

/**
 * Epic A1: sign up with email and password. Supabase Auth sends the
 * confirmation email (config.toml `[auth.email.smtp]`, routed through Resend
 * per AC2). No session exists until the link in that email is followed.
 */
export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = authCredentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // AC4: duplicate email returns a clear error and creates no partial record.
    // Supabase returns a generic "already registered" style error here; the
    // profiles row is only ever created by the DB trigger on a real insert
    // into auth.users, so a rejected signUp leaves nothing behind.
    return { error: error.message };
  }

  // §3.5: "seller_signed_up | Auth record created, role seller |
  // signup_source." §4 HARD RULE: every account is both buyer and seller
  // capability, no separate seller signup — "role seller" describes what
  // this event measures (the growth-relevant signup), not a distinct
  // account type. `signup_source` has no acquisition-channel tracking
  // anywhere in this codebase yet (no UTM/referrer capture at signup); "web"
  // is the only channel that exists.
  if (data.user) {
    await track("seller_signed_up", { signup_source: "web" }, data.user.id);
  }

  return {
    info: "Check your email to confirm your account before signing in.",
  };
}

/**
 * Epic A2: sign in. AC2 — invalid credentials return a generic failure that
 * does not reveal whether the email exists.
 */
export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = authCredentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const redirectTo = formData.get("redirectTo");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error: "Confirm your email before signing in.",
        unconfirmedEmail: parsed.data.email,
      };
    }
    // Generic message: never reveal whether the email is registered.
    return { error: "Invalid email or password." };
  }

  // Was "/dashboard/profile" — every sign-in landed on the profile-edit
  // form regardless of whether the visitor actually needed it, which read
  // as a forced profile-completion step. There is no such gate anywhere
  // else in the app (middleware only protects /sell, /dashboard, /orders;
  // home/browse/listing/checkout were always reachable) — this default was
  // the one place actually pushing people there. A real `redirectTo` (set
  // by middleware when a protected route bounced them to sign-in) still
  // takes priority and is unaffected.
  redirect(sanitizeRedirectPath(redirectTo, "/"));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

/** Epic A1 AC3: an unverified user sees a resend link. */
export async function resendConfirmationAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = formData.get("email");
  if (typeof email !== "string" || email.length === 0) {
    return { error: "Missing email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });

  if (error) {
    return { error: error.message, unconfirmedEmail: email };
  }

  return { info: "Confirmation email resent. Check your inbox.", unconfirmedEmail: email };
}
