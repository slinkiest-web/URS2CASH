"use client";

import { useActionState } from "react";
import { resendConfirmationAction, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

const initialState: AuthFormState = {};

/**
 * Epic A1 AC3: "a clear message and a resend link" for an unconfirmed
 * email. Shared by sign-in (an unconfirmed login attempt) and checkout
 * (§10 Epic D1 AC1 — buying requires a verified email) rather than
 * duplicating the same `useActionState(resendConfirmationAction, ...)`
 * wiring at both call sites.
 */
export function ResendConfirmationForm({
  email,
  className,
  buttonClassName,
}: {
  email: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(resendConfirmationAction, initialState);

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="outline" disabled={pending} className={buttonClassName}>
        {pending ? "Resending…" : "Resend confirmation email"}
      </Button>
      {state.info ? <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">{state.info}</p> : null}
      {state.error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
    </form>
  );
}
