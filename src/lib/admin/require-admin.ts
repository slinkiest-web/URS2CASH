import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ok, err, type Result } from "@/lib/result";

/**
 * PRD §11.2 HARD RULE: "every admin action re verifies admin role from the
 * database. Middleware protection is not sufficient." Every admin server
 * action calls this first, unconditionally — never trusts that the caller
 * reached the action through the /admin route group (middleware's own
 * check, src/middleware.ts, only controls whether the *page* 404s; it says
 * nothing about whether a direct call to the action itself is authorized).
 *
 * Deliberately re-queries `profiles.is_admin` via the service-role client on
 * every call rather than trusting anything cached on the session/JWT — a
 * role revoked mid-session must take effect on the very next action call,
 * not after a token refresh.
 */
export async function requireAdmin(): Promise<Result<{ adminId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in required.");
  }

  const service = createServiceClient();
  const { data: profile } = await service.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();

  if (!profile?.is_admin) {
    return err("not_authorized", "Not authorized.");
  }

  return ok({ adminId: user.id });
}
