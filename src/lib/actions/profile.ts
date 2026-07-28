"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validation";
import { type Result, ok, err } from "@/lib/result";

export type UpdateProfileInput = {
  displayName: string;
  bio?: string;
  phone?: string;
  state: string;
  avatarUrl?: string;
};

/**
 * Epic A3: complete/edit the seller profile. Self-update only — enforced
 * both by the `profiles_update_own` RLS policy and by re-checking the
 * session here (PRD §11.2: every server action re-checks authorisation).
 */
export async function updateProfileAction(
  input: UpdateProfileInput
): Promise<Result<void>> {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return err(
      "validation_error",
      issue?.message ?? "Check the highlighted fields.",
      issue?.path[0]?.toString()
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in to edit your profile.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      bio: parsed.data.bio || null,
      phone: parsed.data.phone || null,
      state: parsed.data.state,
      avatar_url: parsed.data.avatarUrl || null,
    })
    .eq("id", user.id);

  if (error) {
    return err("update_failed", "Could not save your profile. Try again.");
  }

  revalidatePath("/dashboard/profile");
  return ok(undefined);
}
