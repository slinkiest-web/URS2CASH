/**
 * Server-side Supabase client (Server Components, Server Actions, Route Handlers).
 *
 * Uses the anon key + cookie session. Does NOT use the service role key.
 * For service role access, use lib/supabase/service.ts (server-only).
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
// TODO: import type { Database } from "./types"; // uncomment after first `supabase gen types typescript`

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,    // non-null: required at boot
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!, // non-null: required at boot
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll can throw in Server Components; that is expected and safe.
          }
        },
      },
    }
  );
}
