"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthFormState } from "@/lib/actions/auth";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";

const initialState: AuthFormState = {};

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <AuthSplitScreen>
      <h1 className="font-display text-2xl font-extrabold text-u2c-ink sm:text-3xl">Create an account</h1>
      <p className="mt-1 text-[15px] text-u2c-ink-soft">Buy or sell on Urs2Cash. One account does both.</p>

      {state.info ? (
        <p className="mt-6 rounded-[var(--u2c-radius-card)] border border-u2c-line bg-u2c-surface p-3 text-[15px] text-u2c-ink">
          {state.info}
        </p>
      ) : (
        <form action={formAction} className="mt-6 flex flex-col gap-4">
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
              autoComplete="new-password"
              minLength={8}
              required
              className="h-11 rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-surface px-3 text-[15px] text-u2c-ink outline-none focus:border-u2c-focus focus:ring-2 focus:ring-u2c-focus/30"
            />
            <p className="text-[13px] text-u2c-ink-soft">At least 8 characters.</p>
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
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>
      )}

      <p className="mt-6 text-[15px] text-u2c-ink-soft">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-u2c-primary underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </AuthSplitScreen>
  );
}
