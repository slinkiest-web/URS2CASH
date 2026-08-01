import { SignInForm } from "./sign-in-form";
import { sanitizeRedirectPath } from "@/lib/safe-redirect";

const ERROR_MESSAGES: Record<string, string> = {
  confirmation_failed: "That confirmation link is invalid or has expired.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  // Was "/dashboard/profile" — this page resolves its own fallback and
  // passes it to SignInForm as a fixed hidden field, so fixing only the
  // action's own default (src/lib/actions/auth.ts) was not enough; this is
  // the value that actually reaches the server on a plain sign-in with no
  // redirectTo query param. See that file's comment for the full reasoning.
  const redirectTo = sanitizeRedirectPath(params.redirectTo, "/");
  const initialError = params.error ? ERROR_MESSAGES[params.error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Welcome back to Urs2Cash.
      </p>

      <SignInForm redirectTo={redirectTo} initialError={initialError} />
    </main>
  );
}
