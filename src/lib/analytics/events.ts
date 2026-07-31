/**
 * PostHog event registry.
 *
 * HARD RULE (PRD §3.5): every event below fires from the code path that owns
 * it. This file is the single registry of all event names and their
 * required properties — types only, no implementation. See `track-client.ts`
 * (posthog-js, browser) and `track-server.ts` (posthog-node, everywhere
 * else) for the real capture calls; almost every event in this codebase
 * fires server-side, since almost every mutation is a server action or
 * route handler, not a client-side interaction.
 *
 * Sink: PostHog. All events carry user_id (PostHog's `distinctId`),
 * timestamp (both SDKs stamp this automatically), and session_id.
 * `session_id` is posthog-js's own automatic browser-session concept —
 * genuinely present on every client-fired event with zero code needed here.
 * Server-fired events (the majority) have no browser session to attach one
 * to; this is a real, documented limitation (see docs/DECISIONS.md), not a
 * silent gap — building session-forwarding infrastructure so a server
 * action's event can carry the browser tab's session id is a real, separate
 * piece of work this prompt does not take on.
 */

/** Union of all valid event names — derived directly from PRD §3.5. */
export type EventName =
  | "seller_signed_up"
  | "listing_draft_started"
  | "listing_published"
  | "listing_publish_failed"
  | "list_another_clicked"
  | "contact_detail_flagged"
  | "support_contact_opened"
  | "contact_details_released"
  | "rating_submitted"
  | "rating_prompt_shown"
  | "listing_limit_reached"
  | "listing_viewed"
  | "checkout_started"
  | "order_paid"
  | "order_shipped"
  | "order_delivered"
  | "order_released"
  | "order_disputed"
  | "order_refunded"
  | "payout_marked_paid"
  | "category_enabled";

/** Per-event property shapes, derived directly from PRD §3.5's table. */
export type EventProperties = {
  seller_signed_up: { signup_source: string };
  listing_draft_started: { category_id: string; is_first_listing: boolean };
  listing_published: {
    listing_id: string;
    category_id: string;
    price_kobo: number;
    condition: string;
    photo_count: number;
    seller_listing_index: number;
    time_to_publish_seconds: number;
  };
  listing_publish_failed: { category_id: string; failure_reason: string };
  list_another_clicked: { from_listing_id: string };
  contact_detail_flagged: { category_id: string; listing_id: string; detected_type: string };
  support_contact_opened: { listing_id: string; category_id: string };
  contact_details_released: { order_id: string };
  rating_submitted: {
    order_id: string;
    seller_id: string;
    score: number;
    has_review: boolean;
    days_since_released: number;
  };
  rating_prompt_shown: { order_id: string };
  listing_limit_reached: { seller_id: string; tier: string; active_listing_count: number };
  listing_viewed: { listing_id: string; category_id: string; referrer_surface: string };
  checkout_started: { listing_id: string; price_kobo: number };
  order_paid: {
    order_id: string;
    listing_id: string;
    category_id: string;
    amount_kobo: number;
    commission_kobo: number;
    is_repeat_buyer: boolean;
  };
  order_shipped: { order_id: string; hours_since_paid: number };
  order_delivered: { order_id: string; hours_since_shipped: number };
  order_released: { order_id: string; days_listing_to_sale: number };
  order_disputed: { order_id: string; dispute_reason: string };
  order_refunded: { order_id: string; refund_reason: string };
  payout_marked_paid: { payout_id: string; hours_since_released: number };
  category_enabled: { category_id: string; listing_count_at_flip: number };
};
