/**
 * Service-role Supabase client.
 *
 * HARD RULE (PRD §12.3): this file is server-only.
 * The `server-only` import below makes it a build-time error to import this
 * module into any Client Component or any file that is part of the client bundle.
 *
 * Allowed importers: Server Actions, Route Handlers (/api/**), Cron routes.
 * Never import this in: components, pages (unless Server Component with no
 * "use client"), or lib/supabase/client.ts / lib/supabase/server.ts.
 */
import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Returns a Supabase client authenticated as the service role.
 * Bypasses RLS. Use only for admin/system operations.
 */
export function createServiceClient() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. " +
        "These are server-only environment variables. Check .env.local."
    );
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
