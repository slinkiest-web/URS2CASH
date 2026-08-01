import { createClient } from "@/lib/supabase/client";

const BUCKET = "listing-photos";

export type PhotoUploadResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Uploads a profile photo into the same `listing-photos` bucket listing
 * photos already use, under the same `<uid>/...` folder convention its RLS
 * policies key off (storage.foldername(name)[1] = auth.uid()::text) — no
 * new bucket/migration needed, just a distinct filename prefix so avatar
 * uploads don't collide with a seller's listing photo uploads.
 */
export async function uploadAvatarPhoto(file: File, userId: string): Promise<PhotoUploadResult> {
  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/avatar-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return { ok: true, url: publicUrl };
}
