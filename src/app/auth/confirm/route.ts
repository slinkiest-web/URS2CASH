import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRedirectPath } from "@/lib/safe-redirect";

/**
 * Epic A1: exchanges the token from the confirmation email
 * (supabase/templates/confirmation.html) for a session, using the server
 * client so the session lands in cookies via @supabase/ssr — not the
 * implicit/URL-fragment flow Supabase's default hosted verify page uses.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(sanitizeRedirectPath(next, "/dashboard/profile"));
    }
  }

  redirect("/sign-in?error=confirmation_failed");
}
