/**
 * Browser-side Supabase client.
 *
 * Uses the public anon key only. Safe to import in Client Components.
 * Never import service.ts here — service role is server-only.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    // These NEXT_PUBLIC_ vars are intentionally client-safe.
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!, // non-null: value is required at boot
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]! // non-null: value is required at boot
  );
}
