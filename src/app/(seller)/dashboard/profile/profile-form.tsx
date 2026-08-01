"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/lib/actions/profile";
import { nigerianStateSchema } from "@/lib/validation";
import { uploadAvatarPhoto } from "@/lib/storage/upload-avatar-photo";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type FormState = { error?: string; success?: boolean };

const NIGERIAN_STATES = nigerianStateSchema.options;

export function ProfileForm({ profile, userId }: { profile: Profile; userId: string }) {
  const router = useRouter();

  // Controlled inputs, deliberately — React resets uncontrolled
  // (defaultValue) form fields whenever a <form action> completes, success
  // or failure (this is documented React 19 behavior, not specific to this
  // app). With defaultValue, a rejected save wiped every field the user had
  // typed, with no way to recover their entries and no visible cause (found
  // live 2026-08-01). Controlled state isn't touched by that reset, so
  // whatever the user typed survives a failed save exactly as they left it.
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [profileState, setProfileState] = useState(profile.state ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  async function handleAvatarSelect(file: File) {
    setAvatarUploading(true);
    setAvatarError(null);
    const result = await uploadAvatarPhoto(file, userId);
    setAvatarUploading(false);
    if (result.ok) {
      setAvatarUrl(result.url);
    } else {
      setAvatarError(result.error);
    }
  }

  // No `required`/`minLength`/`type="url"` native HTML constraints on any
  // field below — deliberately. The browser runs its own constraint
  // validation on submit BEFORE the form's action ever fires; a field that
  // fails it (a blank required <select>, a non-URL string in a type="url"
  // input) silently blocks the click with no network request, no console
  // error, and no error message of ours — the exact "click Save, nothing
  // happens" bug (found live 2026-08-01, reproduced with a fresh profile:
  // state starts unselected, native validation blocked every click before
  // React ever saw it). Real validation — with a message we control — runs
  // server-side via profileUpdateSchema; that's the only validation this
  // form relies on.
  async function submitProfile(): Promise<FormState> {
    const result = await updateProfileAction({
      displayName,
      bio: bio || undefined,
      phone: phone || undefined,
      state: profileState,
      avatarUrl: avatarUrl || undefined,
    });

    if (!result.ok) {
      return { error: result.error.message };
    }
    // A successful save used to just sit there with a "Profile saved." line
    // and nowhere to go — found live 2026-08-01 during demo prep. Send them
    // somewhere useful instead of leaving them stuck on this page.
    router.push("/");
    return { success: true };
  }

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
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
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
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={3}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className="text-sm font-medium">
          Phone <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08031234567"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="text-xs text-zinc-500">e.g. 08031234567 — we&apos;ll format it for you.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="state" className="text-sm font-medium">
          State
        </label>
        <select
          id="state"
          name="state"
          value={profileState}
          onChange={(e) => setProfileState(e.target.value)}
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
        <label htmlFor="avatarFile" className="text-sm font-medium">
          Profile photo <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary/uploaded avatar URL, see Decision #52
            <img src={avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-200 text-sm text-zinc-500 dark:bg-zinc-800">
              {displayName ? displayName.charAt(0).toUpperCase() : "?"}
            </div>
          )}
          <input
            id="avatarFile"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => e.target.files?.[0] && handleAvatarSelect(e.target.files[0])}
            className="text-sm"
          />
        </div>
        {avatarUploading ? <p className="text-xs text-zinc-500">Uploading…</p> : null}
        {avatarError ? (
          <p className="text-xs text-red-600 dark:text-red-400">{avatarError}</p>
        ) : null}
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
