import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "./profile-form";

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
    </main>
  );
}
