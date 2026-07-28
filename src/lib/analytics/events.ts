/**
 * PostHog analytics event stubs.
 *
 * HARD RULE (PRD §3.5): every event below fires from the code path that owns
 * it, in the same commit as the feature. This file is the single registry of
 * all event names and their required properties.
 *
 * Sink: PostHog. All events carry user_id, timestamp, session_id (PostHog
 * adds these automatically when identify() is called).
 *
 * Implementation: events are called via posthog-js on the client, or via
 * the PostHog Node SDK in server actions.
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

/**
 * TODO(prompt 22): replace this stub with real posthog-js (client) / PostHog
 * Node SDK (server) calls. Stubbed to a structured log for now so every call
 * site is exercised and correctly typed ahead of the full event layer.
 */
export function track<E extends EventName>(event: E, properties: EventProperties[E]): void {
  console.log("[analytics]", event, properties);
}
