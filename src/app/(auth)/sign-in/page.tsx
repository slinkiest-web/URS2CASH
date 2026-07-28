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
  const redirectTo = sanitizeRedirectPath(params.redirectTo, "/dashboard/profile");
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
