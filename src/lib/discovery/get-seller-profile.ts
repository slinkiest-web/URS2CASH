/**
 * Public seller-profile header data (PRD §10 Epic C4 AC1).
 *
 * Separate from src/lib/reputation/get-seller-reputation.ts, which takes a
 * sellerId and owns trust/stats — this module owns the handle -> id lookup
 * and the profile-only fields (`bio`, `state`) the reputation query doesn't
 * carry. The two are composed by the page, never merged into one query, so
 * the reputation module stays reusable by both listing detail (Prompt 11)
 * and this page without a profile-page-specific shape leaking into it.
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type SellerProfile = {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  bio: string | null;
  state: string | null;
  memberSince: string;
};

/**
 * Returns null for a handle that doesn't exist or belongs to a suspended
 * seller — `profiles_public` already filters suspended rows at the view
 * level (docs/DECISIONS.md #1), so a null result here reads as "seller not
 * found," same convention as `getSellerReputation`.
 */
export const getSellerProfile = cache(async (handle: string): Promise<SellerProfile | null> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles_public")
    .select("id, display_name, handle, avatar_url, bio, state, created_at")
    .eq("handle", handle)
    .single();

  if (!data || !data.id || !data.display_name || !data.handle || !data.created_at) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    handle: data.handle,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    state: data.state,
    memberSince: data.created_at,
  };
});
