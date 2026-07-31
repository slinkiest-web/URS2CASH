import "server-only";
import { PostHog } from "posthog-node";
import type { EventName, EventProperties } from "./events";

/**
 * Server-side event capture (PRD §12.1: PostHog Node SDK). Used by every
 * server action and route handler — the large majority of this codebase's
 * mutations, since almost nothing here is a client-side-only interaction.
 *
 * A fresh client per call, immediately shut down after capturing: Vercel
 * serverless functions can freeze the instant a response is sent, and
 * posthog-node buffers events internally rather than sending them
 * synchronously — without an explicit `shutdown()` (which flushes the
 * queue), a capture issued right before a server action returns can be
 * silently dropped. This costs one extra network round trip per event
 * versus sharing a long-lived client; an acceptable tradeoff at this
 * project's volume for guaranteed delivery over throughput.
 *
 * `distinctId` (PostHog's name for §3.5's `user_id`) is a required
 * parameter, not inferred — there is no ambient "current user" available
 * the way `auth.uid()` is inside RLS; every call site already has the
 * relevant actor's id in scope from its own auth check. See
 * docs/DECISIONS.md for the rule this codebase applies when an event's
 * natural subject isn't the literal caller (e.g. `order_released` uses the
 * seller's id even when a cron job triggered it).
 *
 * No-ops (logs and returns) when `NEXT_PUBLIC_POSTHOG_KEY` isn't set,
 * matching this codebase's established "not configured" posture for
 * Paystack/Resend (`initializeTransaction`, `sendEmail`) — never throws,
 * never blocks the caller's real work.
 */
export async function track<E extends EventName>(
  event: E,
  properties: EventProperties[E],
  distinctId: string
): Promise<void> {
  const apiKey = process.env["NEXT_PUBLIC_POSTHOG_KEY"];
  const host = process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://app.posthog.com";

  if (!apiKey) {
    console.log("[analytics:server] PostHog not configured, skipping", event, properties);
    return;
  }

  const client = new PostHog(apiKey, { host, flushAt: 1, flushInterval: 0 });
  try {
    client.capture({ distinctId, event, properties });
    await client.shutdown();
  } catch (error) {
    console.error("[analytics:server] capture failed", event, error);
  }
}
