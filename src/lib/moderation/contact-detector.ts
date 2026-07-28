/**
 * Contact-detail detector. PRD §9.3.
 *
 * HARD RULE: this is a moderation concern, not a submission gate. Detection
 * flags and records; it never blocks. When implemented (a later prompt), a
 * detection creates a `moderation_flags` row (source `auto_contact_detect`)
 * and fires `contact_detail_flagged` — the listing still publishes either way.
 *
 * TODO(prompt 9): implement real detection of Nigerian phone number formats
 * (+234, 0803, 234803, spaced/dashed/dotted, spelled-digit and letter
 * substitution obfuscation), email addresses, WhatsApp/Instagram/Telegram
 * references, and URLs in `title`/`description`/`condition_notes`. Tuned for
 * recall over precision per §9.3.
 *
 * Stubbed to always report "not detected" so `createListing` has exactly one
 * correct call site to wire the real detector into.
 */
export type ContactDetectionResult = {
  detected: boolean;
  detectedType?: string;
  matchedText?: string;
};

export function scanForContactDetails(_text: string): ContactDetectionResult {
  return { detected: false };
}
