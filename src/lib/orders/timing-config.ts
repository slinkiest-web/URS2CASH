/**
 * PRD §8.1 — the time windows governing order auto-transitions. Centralized
 * here per this prompt's own instruction ("these windows should be
 * configuration values, not hardcoded constants") — every cron route and
 * every place that displays a deadline imports from here, never inlines a
 * literal number.
 */

/** §8.1 HARD RULE: "Payment never completed within 30 minutes" — pending -> expired. */
export const PENDING_EXPIRY_MINUTES = 30;

/** §8.1 HARD RULE: "auto_release_at is set to shipped_at + 7 days" — shipped -> delivered (auto). */
export const SHIPPED_AUTO_RELEASE_DAYS = 7;

/**
 * NOT stated anywhere in the PRD as a number — §8.1's own state diagram and
 * §10 Epic D5 AC1 (a dispute may be raised "on... delivered, within 7 days
 * of delivered_at or auto_release_at, whichever is first") both require
 * `delivered` to persist as a real, observable state with its own eventual
 * auto-release, but no HARD RULE states the window length the way it does
 * for the other two. This value (72 hours) comes from this prompt's own
 * task brief; confirmed with the user before building rather than assumed
 * silently — see docs/DECISIONS.md #61 for the full reasoning, including
 * why AC2's literal "delivered transitions immediately to released" is read
 * as "automatic, no admin approval gate" rather than "zero elapsed time."
 */
export const DELIVERED_AUTO_RELEASE_HOURS = 72;

/**
 * §10 Epic D5 AC1: "within 7 days of delivered_at or auto_release_at,
 * whichever is first." `orders.auto_release_at` (set by markShipped) is
 * the SHIPPED->DELIVERED deadline, not a DELIVERED->RELEASED one, so
 * "whichever is first" is implemented via the status guard itself (an
 * order that already auto-released is no longer in the disputable status
 * set) rather than by referencing that column directly — see
 * docs/DECISIONS.md. This constant only governs the delivered_at + N days
 * half of the check, passed as a parameter into raise_dispute(), never
 * hardcoded in SQL.
 */
export const DISPUTE_WINDOW_DAYS = 7;
