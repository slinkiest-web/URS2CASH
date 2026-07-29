import type { NextConfig } from "next";

/**
 * PRD §5.3 performance requirement: "Image lazy loading, responsive sizes,
 * AVIF or WebP." `next/image` needs every external image host allowlisted —
 * every listing photo lives in Supabase Storage, an external host from
 * Next's perspective. Covers local dev (`supabase start`'s 127.0.0.1),
 * standard hosted Supabase (`*.supabase.co`), and whatever
 * `NEXT_PUBLIC_SUPABASE_URL` actually resolves to (self-hosted/custom
 * domain), so this file never needs manual edits when the project moves
 * between environments.
 */
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [
  { protocol: "http", hostname: "127.0.0.1" },
  { protocol: "https", hostname: "*.supabase.co" },
];

const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
if (supabaseUrl) {
  try {
    const { protocol, hostname } = new URL(supabaseUrl);
    remotePatterns.push({ protocol: protocol === "https:" ? "https" : "http", hostname });
  } catch {
    // Missing/malformed at build time (e.g. CI without env vars) — the two
    // static patterns above still cover local dev and standard hosted Supabase.
  }
}

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns,
  },
};

export default nextConfig;
