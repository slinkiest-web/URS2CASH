"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/lib/actions/profile";
import { nigerianStateSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type FormState = { error?: string; success?: boolean };

const NIGERIAN_STATES = nigerianStateSchema.options;

async function submitProfile(_prevState: FormState, formData: FormData): Promise<FormState> {
  const result = await updateProfileAction({
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? "") || undefined,
    phone: String(formData.get("phone") ?? "") || undefined,
    state: String(formData.get("state") ?? ""),
    avatarUrl: String(formData.get("avatarUrl") ?? "") || undefined,
  });

  if (!result.ok) {
    return { error: result.error.message };
  }
  return { success: true };
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState(submitProfile, {});

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={profile.display_name}
          minLength={2}
          maxLength={50}
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bio" className="text-sm font-medium">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={profile.bio ?? ""}
          maxLength={280}
          rows={3}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className="text-sm font-medium">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={profile.phone ?? ""}
          placeholder="+2348012345678"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="text-xs text-zinc-500">E.164 format, e.g. +2348012345678.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="state" className="text-sm font-medium">
          State
        </label>
        <select
          id="state"
          name="state"
          defaultValue={profile.state ?? ""}
          required
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="" disabled>
            Select a state
          </option>
          {NIGERIAN_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="avatarUrl" className="text-sm font-medium">
          Avatar URL
        </label>
        <input
          id="avatarUrl"
          name="avatarUrl"
          type="url"
          defaultValue={profile.avatar_url ?? ""}
          placeholder="https://…"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Profile saved.</p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
