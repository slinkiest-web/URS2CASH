import { SignInForm } from "./sign-in-form";
import { sanitizeRedirectPath } from "@/lib/safe-redirect";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";

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
    <AuthSplitScreen>
      <h1 className="font-display text-2xl font-extrabold text-u2c-ink sm:text-3xl">Sign in</h1>
      <p className="mt-1 text-[15px] text-u2c-ink-soft">Welcome back to Urs2Cash.</p>

      <SignInForm redirectTo={redirectTo} initialError={initialError} />
    </AuthSplitScreen>
  );
}
