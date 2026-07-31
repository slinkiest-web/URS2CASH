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

      <ProfileForm profile={profile} />

      {!payoutAccount ? (
        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Add a payout account so you can be paid when you make a sale. You can still publish listings without one.
        </p>
      ) : null}
      <div className="mt-3">
        <PayoutAccountForm
          existing={
            payoutAccount
              ? { bankName: payoutAccount.bank_name, accountNumber: payoutAccount.account_number, accountName: payoutAccount.account_name }
              : null
          }
        />
      </div>
    </main>
  );
}
