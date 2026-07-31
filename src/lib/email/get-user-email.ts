import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type ServiceClient = SupabaseClient<Database>;

/**
 * `profiles` has no email column — it lives on `auth.users`, reachable
 * only via the service-role client's admin API (same mechanism
 * `scripts/promote-admin.ts` already uses to look a user up by email, in
 * reverse: here by id). Every email sender in `src/lib/email/senders/`
 * goes through this rather than querying `auth.users` directly.
 */
export async function getUserEmail(service: ServiceClient, userId: string): Promise<string | null> {
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}
