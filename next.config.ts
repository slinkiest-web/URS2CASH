import type { NextConfig } from "next";
import { getAllowedImageHosts } from "./src/lib/images/allowed-hosts";

/**
 * PRD §5.3 performance requirement: "Image lazy loading, responsive sizes,
 * AVIF or WebP." `next/image` needs every external image host allowlisted —
 * every listing photo lives in Supabase Storage, an external host from
 * Next's perspective. The actual host list — local dev (`supabase start`'s
 * 127.0.0.1), standard hosted Supabase (`*.supabase.co`), and whatever
 * `NEXT_PUBLIC_SUPABASE_URL` actually resolves to — lives in
 * src/lib/images/allowed-hosts.ts, shared with the write-path Zod guard and
 * the render-path guards on ListingCard/PhotoGallery, so this file, the
 * schema, and the components can never drift out of sync with each other.
 */
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = getAllowedImageHosts().map(
  (host) => ({ protocol: host.protocol, hostname: host.hostname })
);

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns,
  },
};

export default nextConfig;
