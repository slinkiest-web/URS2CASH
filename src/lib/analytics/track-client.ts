"use client";

import posthog from "posthog-js";
import type { EventName, EventProperties } from "./events";

/**
 * Client-side event capture (PRD §12.1: posthog-js). Used only by the
 * handful of call sites that are genuinely client-interaction events
 * (`listing_draft_started`, `list_another_clicked`, `support_contact_opened`)
 * — everything else fires server-side via `track-server.ts`.
 *
 * No `distinctId` parameter: posthog-js manages this itself, automatically
 * (an anonymous id via cookie/localStorage until `posthog.identify()` is
 * called, which this codebase does not do yet — a real, documented gap, see
 * docs/DECISIONS.md). `session_id` and `timestamp` are also automatic on
 * every browser capture, no code needed here.
 *
 * No-ops (logs and returns) when `NEXT_PUBLIC_POSTHOG_KEY` isn't set, same
 * "not configured" posture as `track-server.ts`.
 */
export function track<E extends EventName>(event: E, properties: EventProperties[E]): void {
  if (!process.env["NEXT_PUBLIC_POSTHOG_KEY"]) {
    console.log("[analytics:client] PostHog not configured, skipping", event, properties);
    return;
  }
  posthog.capture(event, properties);
}
