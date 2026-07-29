import { createServiceClient } from "@/lib/supabase/service";
import { track } from "@/lib/analytics/events";
import type { ContactDetectionResult } from "@/lib/moderation/contact-detector";

/**
 * PRD §9.3: on a detection, (1) the listing has already published/saved
 * normally by the time this runs — never called from a path that can fail
 * the write — (2) a `moderation_flags` row is created with source
 * `auto_contact_detect`, carrying the matched pattern type and text, which
 * naturally surfaces it at the top of a "newest first" admin queue (Epic E1
 * AC1 — no separate priority column exists or is needed), and (3)
 * `contact_detail_flagged` fires.
 *
 * `moderation_flags` has zero RLS policies for `anon`/`authenticated` (§7.2:
 * "Admin only") — this write can only ever succeed via the service-role
 * client, never the caller's own session, matching how every other
 * system-initiated write in this codebase is done (docs/DECISIONS.md #7,
 * #20).
 *
 * Never call this from a path that can still fail the listing/rating write —
 * it must run only after that write has already succeeded.
 */
export async function flagContactDetection(params: {
  listingId: string;
  categorySlug: string;
  detection: ContactDetectionResult;
}): Promise<void> {
  if (!params.detection.detected) return;

  const { detectedType, matchedText } = params.detection;
  const service = createServiceClient();

  const { error } = await service.from("moderation_flags").insert({
    listing_id: params.listingId,
    source: "auto_contact_detect",
    reason: `Automatically detected a ${detectedType} reference in listing text.`,
    pattern_type: detectedType,
    matched_text: matchedText,
  });

  if (error) {
    // §9.3 HARD RULE: detection never blocks. A failure to record the flag
    // is logged, not surfaced to the caller — the listing write it's
    // attached to has already succeeded and must stay that way.
    console.error("[contact-detector] failed to insert moderation_flags row", error);
    return;
  }

  track("contact_detail_flagged", {
    category_id: params.categorySlug,
    listing_id: params.listingId,
    detected_type: detectedType,
  });
}
