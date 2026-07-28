import { createClient } from "@/lib/supabase/client";

const BUCKET = "listing-photos";

export type PhotoUploadResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Uploads one photo to the `listing-photos` Storage bucket under the
 * uploader's own folder (enforced by RLS — see
 * supabase/migrations/20260728134156_listing_photos_storage.sql) and returns
 * its public URL. PRD §15.5 B20: client-side only, no processing pipeline.
 */
export async function uploadListingPhoto(file: File, sellerId: string): Promise<PhotoUploadResult> {
  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${sellerId}/${crypto.randomUUID()}.${extension}`;

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
