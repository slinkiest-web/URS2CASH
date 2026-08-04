"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction, type AuthFormState } from "@/lib/actions/auth";
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form";

const initialState: AuthFormState = {};

export function SignInForm({
  redirectTo,
  initialError,
}: {
  redirectTo: string;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState(signInAction, {
    ...initialState,
    error: initialError,
  });

  return (
    <>
      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[13px] font-bold uppercase tracking-[0.03em] text-u2c-ink">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-11 rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-surface px-3 text-[15px] text-u2c-ink outline-none focus:border-u2c-focus focus:ring-2 focus:ring-u2c-focus/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[13px] font-bold uppercase tracking-[0.03em] text-u2c-ink">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-11 rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-surface px-3 text-[15px] text-u2c-ink outline-none focus:border-u2c-focus focus:ring-2 focus:ring-u2c-focus/30"
          />
        </div>

        {state.error ? (
          <p className="text-[15px] text-u2c-error" role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 h-11 rounded-[var(--u2c-radius-control)] bg-u2c-primary text-[13px] font-bold uppercase tracking-[0.03em] text-white transition-colors duration-150 hover:bg-u2c-primary-press disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-u2c-focus"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {state.unconfirmedEmail ? (
        <ResendConfirmationForm email={state.unconfirmedEmail} className="mt-4" buttonClassName="w-full" />
      ) : null}

      <p className="mt-6 text-[15px] text-u2c-ink-soft">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="font-semibold text-u2c-primary underline underline-offset-4">
          Create one
        </Link>
      </p>
    </>
  );
}
