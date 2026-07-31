/**
 * PRD §10 Epic E5 AC2: "Admin role is a database column, never an env var
 * list of emails." This script is the ONLY sanctioned way to set
 * `profiles.is_admin = true` — there is no server action, no UI, and no
 * public route that can grant admin, and there must never be one (any such
 * action would have nothing legitimate to check the caller's own admin
 * status against — the classic privilege-escalation bootstrap problem).
 * Run manually, once per new admin, by whoever holds the service-role key.
 *
 * Usage:
 *   npm run admin:promote -- someone@example.com
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in the
 * environment — `.env.local` locally; the real deployment's secrets when
 * granting admin in a hosted environment (e.g. `vercel env pull` then run
 * this locally against the production project — never commit those values
 * or wire them into a request handler). Requires the target user to have
 * already completed signup (a `profiles` row must already exist).
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as readline from "node:readline/promises";

// Next.js loads .env.local automatically for `npm run dev`/`build`; this
// script runs outside Next entirely, so it has to load it itself.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run admin:promote -- <email>");
    process.exitCode = 1;
    return;
  }

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local locally).");
    process.exitCode = 1;
    return;
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // supabase-js has no getUserByEmail — paging through listUsers() is fine
  // for a manual, run-once bootstrap script, not a hot path.
  let authUser: { id: string; email?: string } | undefined;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("Could not list users:", error.message);
      process.exitCode = 1;
      return;
    }
    authUser = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (authUser || data.users.length < 200) break;
  }

  if (!authUser) {
    console.error(`No auth user found with email ${email}.`);
    process.exitCode = 1;
    return;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name, is_admin")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile) {
    console.error(`No profiles row for ${email} (auth id ${authUser.id}) — has this user completed signup?`);
    process.exitCode = 1;
    return;
  }

  if (profile.is_admin) {
    console.log(`${email} is already an admin. Nothing to do.`);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Grant admin access to ${email} (${profile.display_name}, profile ${profile.id})? Type "yes" to confirm: `
  );
  rl.close();

  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Aborted. No changes made.");
    return;
  }

  const { error: updateError } = await admin.from("profiles").update({ is_admin: true }).eq("id", authUser.id);
  if (updateError) {
    console.error("Failed to grant admin:", updateError.message);
    process.exitCode = 1;
    return;
  }

  console.log(`${email} is now an admin.`);
}

main();
