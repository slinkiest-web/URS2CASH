"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

let initialized = false;

/**
 * Initializes posthog-js once, client-side only (PRD §12.1). Mounted in the
 * root layout so every page gets the same initialized instance —
 * `track-client.ts`'s `track()` and posthog-js's own `capture_pageview`
 * autocapture both rely on this having run first.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (initialized) return;
    const apiKey = process.env["NEXT_PUBLIC_POSTHOG_KEY"];
    if (!apiKey) return;

    posthog.init(apiKey, {
      api_host: process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://app.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
    });
    initialized = true;
  }, []);

  return children;
}
