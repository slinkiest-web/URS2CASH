import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "./profile-form";
import { PayoutAccountForm } from "./payout-account-form";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth: middleware already protects this route.
  if (!user) {
    redirect("/sign-in?redirectTo=/dashboard/profile");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    // The signup trigger creates this row in the same transaction as
    // auth.users (Epic A1 AC1) — reaching here means something is broken,
    // not that the row is merely missing yet.
    throw new Error("Could not load your profile.");
  }

  // §10 Epic A3 AC5: "A seller with no verified payout account may create
  // listings but sees a persistent prompt to add one." Most-recently-added
  // verified account, since no DB uniqueness on profile_id exists yet
  // (docs/TODOS.md #1) to guarantee at most one row.
  const { data: payoutAccount } = await supabase
    .from("payout_accounts")
    .select("bank_name, account_number, account_name")
    .eq("profile_id", user.id)
    .eq("is_verified", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-6 py-16">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            @{profile.handle}
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      <ProfileForm profile={profile} userId={user.id} />

      {/*
        §10 Epic A3 AC5 requires a persistent prompt when there's no payout
        account, but "persistent" doesn't mean "prominent" or "urgent" — a
        brand new seller hasn't sold anything yet, so this is deliberately
        styled as a secondary, informational section (neutral border, no
        amber/warning treatment) below the main profile form, not a blocking
        gate. Nothing here prevents ProfileForm's own save from succeeding —
        they're two independent forms.
      */}
      <div className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payout settings</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Optional for now — you only need this once you make your first sale. Add it anytime before then.
        </p>
        <div className="mt-3">
          <PayoutAccountForm
            existing={
              payoutAccount
                ? { bankName: payoutAccount.bank_name, accountNumber: payoutAccount.account_number, accountName: payoutAccount.account_name }
                : null
            }
          />
        </div>
      </div>
    </main>
  );
}
