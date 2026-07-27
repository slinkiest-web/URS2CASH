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

// TODO: wire up posthog-js initialisation and a typed `track(event, props)` helper.
