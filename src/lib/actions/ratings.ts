"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { submitRatingInputSchema, type SubmitRatingInput } from "@/lib/ratings/submit-rating-schema";
import { scanForContactDetails } from "@/lib/moderation/contact-detector";
import { flagContactDetection } from "@/lib/moderation/flag-contact-detection";
import { track } from "@/lib/analytics/events";
import { ok, err, type Result } from "@/lib/result";

/**
 * PRD §11.2: submitRating(input): Result<{ ratingId }>. §10 Epic D6.
 *
 * AC1/AC11: only the order's buyer, only on `released` or `refunded`.
 * Re-checked here in application code for a clear error message, but the
 * actual enforcement is `ratings_insert_buyer_on_concluded_order` (Prompt
 * 5's RLS policy) — this insert deliberately goes through the caller's own
 * session client (`supabase`), not the service-role client, so RLS is the
 * real gate, not a convenience layer. This is the opposite posture from
 * every order-lifecycle action (`orders` has no authenticated write policy
 * at all, forcing service-role) — `ratings` is designed the other way.
 *
 * AC3/AC12: no read-then-write check on `ratings` itself — the UNIQUE
 * constraint on `order_id` is the only duplicate guard, caught here as a
 * Postgres 23505 error, never pre-checked.
 *
 * AC4: there is no `updateRating`/`deleteRating` anywhere in this file, and
 * none should ever be added — ratings are immutable by design.
 */
export async function submitRating(input: SubmitRatingInput): Promise<Result<{ ratingId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("not_authenticated", "Sign in to rate this seller.");
  }

  const parsed = submitRatingInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("invalid_input", parsed.error.issues[0]?.message ?? "Check your rating.");
  }
  const data = parsed.data;

  const { data: order } = await supabase
    .from("orders_participant_view")
    .select("id, buyer_id, seller_id, status, listing_id, released_at, refunded_at")
    .eq("id", data.orderId)
    .maybeSingle();

  if (!order || !order.buyer_id || !order.seller_id || !order.listing_id) {
    return err("not_found", "Order not found.");
  }
  if (order.buyer_id !== user.id) {
    return err("not_authorized", "Only the buyer can rate this order.");
  }
  if (order.status !== "released" && order.status !== "refunded") {
    return err("invalid_transition", "This order hasn't concluded yet.");
  }

  // `ratings` deliberately has NO SELECT policy for `authenticated` at all,
  // not even self-read of one's own row (Decision #24 — "no update, no
  // delete, for any role... not even the rater"; public reads go through
  // `ratings_public` only). `.insert(...).select().single()` would issue an
  // INSERT ... RETURNING, which itself requires a passing SELECT policy on
  // the new row — with none, that RETURNING read-back fails RLS even for a
  // fully valid insert (confirmed live: the plain INSERT succeeds, the same
  // INSERT with .select() attached fails with "new row violates row-level
  // security policy"). The id is generated here instead, so no read-back is
  // ever needed.
  const ratingId = crypto.randomUUID();
  const { error } = await supabase.from("ratings").insert({
    id: ratingId,
    order_id: data.orderId,
    rater_id: user.id,
    seller_id: order.seller_id,
    score: data.score,
    review: data.review ?? null,
  });

  if (error) {
    // AC3/AC12: the race is handled by catching the constraint violation,
    // not by a pre-check. Postgres 23505 (unique_violation) on
    // ratings.order_id is exactly a second rating attempt on this order.
    if (error.code === "23505") {
      return err("already_rated", "You've already rated this order.");
    }
    return err("rating_failed", "Could not submit your rating. Try again.");
  }

  // §10 Epic D6 AC7 / §9.3: review text is scanned, flag never block — the
  // rating has already been inserted successfully by the time this runs.
  if (data.review) {
    const detection = scanForContactDetails(data.review);
    if (detection.detected) {
      // moderation_flags.listing_id is NOT NULL — a rating has no listing_id
      // of its own, so it's resolved via the order being rated. categorySlug
      // is only used for the contact_detail_flagged event's category_id
      // property, resolved the same way createListing/updateListing do.
      const service = createServiceClient();
      const { data: listing } = await service
        .from("listings")
        .select("category_id")
        .eq("id", order.listing_id)
        .maybeSingle();

      let categorySlug = "unknown";
      if (listing?.category_id) {
        const { data: category } = await service
          .from("categories")
          .select("slug")
          .eq("id", listing.category_id)
          .maybeSingle();
        categorySlug = category?.slug ?? "unknown";
      }

      await flagContactDetection({ listingId: order.listing_id, categorySlug, detection });
    }
  }

  const concludedAt = order.released_at ?? order.refunded_at;
  const daysSinceReleased = concludedAt ? Math.round((Date.now() - new Date(concludedAt).getTime()) / 86_400_000) : 0;
  track("rating_submitted", {
    order_id: data.orderId,
    seller_id: order.seller_id,
    score: data.score,
    has_review: data.review !== undefined,
    days_since_released: daysSinceReleased,
  });

  return ok({ ratingId });
}
