import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyWebhookSignature } from "@/lib/paystack";
import { createServiceClient } from "@/lib/supabase/service";
import { track } from "@/lib/analytics/events";
import type { Json } from "@/lib/database.types";

const envelopeSchema = z.object({
  event: z.string(),
  data: z.object({ id: z.union([z.number(), z.string()]) }).passthrough(),
});

const chargeSuccessDataSchema = z.object({
  amount: z.number().int(),
  reference: z.string(),
  metadata: z.object({ order_id: z.string() }).nullable().optional(),
});

/**
 * PRD §10 Epic D2 / §8.1 HARD RULE: "`paid` is entered by the Paystack
 * webhook and by nothing else." This route is the only code in the
 * codebase permitted to transition an order to `paid` — enforced not just
 * by convention but structurally: `mark_order_paid` (the Postgres function
 * that performs the actual transition, `supabase/migrations/
 * 20260729100000_mark_order_paid_function.sql`) has `EXECUTE` revoked from
 * every role except `service_role`, so even a buggy or compromised
 * client-side call could not invoke it directly — confirmed live (a plain
 * anon-role RPC call returns `permission denied for function
 * mark_order_paid`).
 *
 * Order of operations, each gate checked before the next is attempted:
 * signature -> parse -> idempotency insert -> event type -> reference/
 * amount reconciliation -> current status -> atomic transition -> events.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  // §10 Epic D2 AC1: invalid signature -> 401, write nothing. Verified
  // against the RAW body — never a re-parsed/re-stringified version, which
  // could differ byte-for-byte from what Paystack actually signed.
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    // A validly-signed request with an unparseable body shouldn't happen
    // from real Paystack traffic. No event_id exists to key an idempotency
    // row on either way, so nothing is written.
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  const envelope = envelopeSchema.safeParse(rawPayload);
  if (!envelope.success) {
    console.error("[webhook][paystack] payload shape unrecognized despite a valid signature", envelope.error.issues);
    return NextResponse.json({ error: "unrecognized payload" }, { status: 400 });
  }

  const eventId = String(envelope.data.data.id);
  const service = createServiceClient();

  // §10 Epic D2 AC2 HARD RULE: every webhook inserts into `webhook_events`
  // FIRST, unconditionally, for every event type (not just charge.success).
  // A UNIQUE (provider, event_id) violation means this exact event has
  // already been recorded — acknowledge 200 and stop. This insert IS the
  // idempotency mechanism; nothing past this point ever substitutes an
  // order-status check for it (AC2 fails if it does — see the `status !==
  // "pending"` check further down, which is a secondary safety net on the
  // transition itself, never the primary dedup gate).
  const { data: insertedEvent, error: insertError } = await service
    .from("webhook_events")
    .insert({
      provider: "paystack",
      event_id: eventId,
      event_type: envelope.data.event,
      payload: rawPayload as Json,
    })
    .select("id")
    .single();

  if (insertError || !insertedEvent) {
    if (insertError?.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }
    console.error("[webhook][paystack] failed to record webhook_events row", insertError);
    // A genuine infra failure recording the ledger row — non-2xx so
    // Paystack retries. We must not silently drop an event we couldn't
    // even log.
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  const webhookEventRowId = insertedEvent.id;
  async function markProcessed(): Promise<void> {
    await service.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", webhookEventRowId);
  }

  if (envelope.data.event !== "charge.success") {
    await markProcessed();
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const chargeData = chargeSuccessDataSchema.safeParse(envelope.data.data);
  if (!chargeData.success) {
    console.error("[webhook][paystack] charge.success payload missing expected fields", {
      eventId,
      issues: chargeData.error.issues,
    });
    await markProcessed();
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const orderId = chargeData.data.metadata?.order_id;
  if (!orderId) {
    console.error("[webhook][paystack] charge.success with no metadata.order_id", { eventId });
    await markProcessed();
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const { data: order } = await service
    .from("orders")
    .select("id, status, amount_kobo, commission_kobo, buyer_id, listing_id, paystack_reference")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    console.error("[webhook][paystack] charge.success references an unknown order", { eventId, orderId });
    await markProcessed();
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // A cheap extra integrity check beyond what AC4 explicitly names: the
  // reference this webhook reports should be exactly the one
  // `initiateCheckout` stored right after Paystack issued it (Prompt 13).
  // Same "don't trust it blindly" class of concern AC4 states for amount —
  // flagged the same way, not transitioned. `processed_at` is deliberately
  // left null here (see the amount-mismatch comment below for why).
  if (order.paystack_reference && order.paystack_reference !== chargeData.data.reference) {
    console.error("[webhook][paystack] REFERENCE MISMATCH — flagged, not transitioned", {
      eventId,
      orderId,
      orderReference: order.paystack_reference,
      webhookReference: chargeData.data.reference,
    });
    return NextResponse.json({ received: true, flagged: true }, { status: 200 });
  }

  // §10 Epic D2 AC4 HARD RULE: never trust the webhook amount blindly —
  // compare against the order's own snapshotted amount_kobo (set once at
  // checkout, Prompt 13, never recomputed). On mismatch: no transition,
  // `processed_at` stays null. There is no dedicated admin-alert table for
  // this in the PRD's schema (docs/DECISIONS.md #58 explains why
  // `moderation_flags` is the wrong fit) — `webhook_events.processed_at IS
  // NULL` is the queryable surface for exactly this class of anomaly until
  // Epic E ships a real admin view for it.
  if (chargeData.data.amount !== order.amount_kobo) {
    console.error("[webhook][paystack] AMOUNT MISMATCH — flagged, not transitioned", {
      eventId,
      orderId,
      webhookAmountKobo: chargeData.data.amount,
      orderAmountKobo: order.amount_kobo,
    });
    return NextResponse.json({ received: true, flagged: true }, { status: 200 });
  }

  if (order.status !== "pending") {
    // Secondary safety net on the transition itself, never the primary
    // idempotency mechanism (that's the webhook_events UNIQUE constraint
    // above, per AC2). Reachable only if some other, differently
    // event-id'd delivery already transitioned this order.
    await markProcessed();
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // §8.1 / §10 Epic D2 AC3: the only atomic write of paid + sold. See the
  // migration for why this must be a single Postgres function call rather
  // than sequential .from() writes.
  const { data: transitioned, error: transitionError } = await service.rpc("mark_order_paid", {
    p_order_id: order.id,
  });

  if (transitionError || !transitioned || transitioned.length === 0) {
    console.error("[webhook][paystack] mark_order_paid did not transition the order", {
      eventId,
      orderId,
      transitionError,
    });
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  // §10 Epic D2 AC5: "order_paid fires with is_repeat_buyer computed from
  // prior released orders by that buyer."
  const { count: priorReleasedCount } = await service
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", order.buyer_id)
    .eq("status", "released");
  const isRepeatBuyer = (priorReleasedCount ?? 0) > 0;

  const { data: listing } = await service.from("listings").select("category_id").eq("id", order.listing_id).single();
  const { data: category } = listing
    ? await service.from("categories").select("slug").eq("id", listing.category_id).single()
    : { data: null };

  // §3.5's own event table for order_paid: order_id, listing_id,
  // category_id, amount_kobo, commission_kobo, is_repeat_buyer — not
  // `buyer_order_ordinal` (docs/DECISIONS.md #59; that property is not in
  // the PRD anywhere, only is_repeat_buyer is, and AC5 names it
  // explicitly).
  track("order_paid", {
    order_id: order.id,
    listing_id: order.listing_id,
    category_id: category?.slug ?? "unknown",
    amount_kobo: order.amount_kobo,
    commission_kobo: order.commission_kobo,
    is_repeat_buyer: isRepeatBuyer,
  });

  // §9.1 HARD RULE: contact details release exactly at `paid`, never
  // earlier — that's now true (mark_order_paid already committed), and
  // this event is the observable record of it.
  track("contact_details_released", { order_id: order.id });

  await markProcessed();

  return NextResponse.json({ received: true }, { status: 200 });
}
