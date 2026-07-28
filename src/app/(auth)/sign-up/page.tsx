"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

const initialState: AuthFormState = {};

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Buy or sell on Urs2Cash. One account does both.
      </p>

      {state.info ? (
        <p className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {state.info}
        </p>
      ) : (
        <form action={formAction} className="mt-6 flex flex-col gap-4">
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
              autoComplete="new-password"
              minLength={8}
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="text-xs text-zinc-500">At least 8 characters.</p>
          </div>

          {state.error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="mt-2">
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
