"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  signInAction,
  resendConfirmationAction,
  type AuthFormState,
} from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

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
  const [resendState, resendAction, resendPending] = useActionState(
    resendConfirmationAction,
    initialState
  );

  return (
    <>
      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {state.error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {state.unconfirmedEmail ? (
        <form action={resendAction} className="mt-4">
          <input type="hidden" name="email" value={state.unconfirmedEmail} />
          <Button type="submit" variant="outline" disabled={resendPending} className="w-full">
            {resendPending ? "Resending…" : "Resend confirmation email"}
          </Button>
          {resendState.info ? (
            <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
              {resendState.info}
            </p>
          ) : null}
        </form>
      ) : null}

      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="font-medium underline underline-offset-4">
          Create one
        </Link>
      </p>
    </>
  );
}
