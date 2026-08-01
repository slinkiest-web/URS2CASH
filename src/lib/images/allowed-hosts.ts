/**
 * Single source of truth for which image hosts this app will ever render
 * via `next/image` — `next.config.ts`'s `images.remotePatterns` and every
 * write-path/render-path guard (src/lib/listings/schema.ts,
 * src/components/listing/listing-card.tsx,
 * src/components/listing/photo-gallery.tsx) all derive from this file, so
 * they can never drift out of sync with each other.
 *
 * Why this exists: `next/image` throws synchronously (not a client-side
 * `onError`) when asked to render a `src` whose host isn't in
 * `remotePatterns` — the error happens during render, before any image
 * element reaches the browser, so it takes down the whole page, not just
 * that one photo. A single listing with a photo URL outside this allowlist
 * used to 500 the entire home page (found live, QA session 2026-07-30).
 * See docs/DECISIONS.md #63.
 */

export type AllowedImageHost = { protocol: "http" | "https"; hostname: string };

/** Same three patterns `next.config.ts` has always covered: local dev, standard hosted Supabase, and whatever NEXT_PUBLIC_SUPABASE_URL resolves to. */
export function getAllowedImageHosts(): AllowedImageHost[] {
  const hosts: AllowedImageHost[] = [
    { protocol: "http", hostname: "127.0.0.1" },
    { protocol: "https", hostname: "*.supabase.co" },
  ];

  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  if (supabaseUrl) {
    try {
      const { protocol, hostname } = new URL(supabaseUrl);
      hosts.push({ protocol: protocol === "https:" ? "https" : "http", hostname });
    } catch {
      // Missing/malformed at build time (e.g. CI without env vars) — the two
      // static patterns above still cover local dev and standard hosted Supabase.
    }
  }

  return hosts;
}

function hostnameMatches(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // "*.supabase.co" -> ".supabase.co"
    return hostname.length > suffix.length && hostname.endsWith(suffix);
  }
  return hostname === pattern;
}

/**
 * Whether `url` is safe to pass to `next/image` — the exact same allowlist
 * `next.config.ts` configures `remotePatterns` from. Used both at the
 * write boundary (Zod, so a listing can never be saved with a
 * non-allowlisted photo URL in the first place) and at render time (so
 * pre-existing or externally-written data that slipped past the write
 * guard degrades to "no photo" instead of crashing the page).
 */
export function isAllowedImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const protocol = parsed.protocol === "https:" ? "https" : "http";

  return getAllowedImageHosts().some(
    (host) => host.protocol === protocol && hostnameMatches(parsed.hostname, host.hostname)
  );
}

/**
 * Next.js's `/_next/image` optimizer refuses to server-side fetch any
 * upstream URL that resolves to a private IP (SSRF hardening, unrelated to
 * `remotePatterns` — found live 2026-07-31: a real uploaded local-dev photo
 * 400'd with "upstream image ... resolved to private ip" even though the
 * host was correctly allowlisted). Local Supabase Storage runs on
 * `127.0.0.1`, so every local-dev listing photo trips this. `next/image`'s
 * `unoptimized` prop skips the server-side proxy fetch entirely — the
 * browser requests the URL directly instead — which sidesteps the guard
 * without weakening it, since no server-side fetch of the private address
 * ever happens. Scoped to exactly this hostname so it can never affect a
 * real deployment: a production listing photo always lives on
 * `*.supabase.co`, a public host, never a private IP.
 */
export function isPrivateIpImageUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
