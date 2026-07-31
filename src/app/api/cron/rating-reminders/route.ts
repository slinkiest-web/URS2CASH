import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verify-cron-secret";
import { createServiceClient } from "@/lib/supabase/service";
import { RATING_REMINDER_HOURS } from "@/lib/orders/timing-config";
import { track } from "@/lib/analytics/events";

const BATCH_LIMIT = 200;

/**
 * PRD §10 Epic D6 AC10: "Buyer is emailed a rating prompt on release. One
 * reminder at 72 hours if unrated. No further reminders." The actual email
 * send is Prompt 22's scope (same deferral as every other order_* event so
 * far) — this route is the correct call site now: it finds concluded
 * orders (`released` or `refunded`) at least `RATING_REMINDER_HOURS` old
 * with no rating yet and no reminder sent yet, fires `rating_prompt_shown`
 * (the prompt being surfaced again, this time via reminder rather than
 * on-page view — PRD §3.5 names no separate "reminder" event), and stamps
 * `rating_reminder_sent_at` so it can never fire twice for the same order.
 *
 * Idempotent and safe to run concurrently, same reasoning as every other
 * cron in this codebase: `rating_reminder_sent_at IS NULL` is the guard, and
 * once stamped, a re-run (or a concurrent one) simply excludes that order.
 * Both GET and POST exported — see docs/DECISIONS.md #63.
 */
async function handle(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const cutoff = new Date(Date.now() - RATING_REMINDER_HOURS * 3_600_000).toISOString();

  const [{ data: releasedCandidates }, { data: refundedCandidates }] = await Promise.all([
    service
      .from("orders")
      .select("id")
      .eq("status", "released")
      .is("rating_reminder_sent_at", null)
      .lte("released_at", cutoff)
      .limit(BATCH_LIMIT),
    service
      .from("orders")
      .select("id")
      .eq("status", "refunded")
      .is("rating_reminder_sent_at", null)
      .lte("refunded_at", cutoff)
      .limit(BATCH_LIMIT),
  ]);

  const candidateIds = [...(releasedCandidates ?? []), ...(refundedCandidates ?? [])].map((r) => r.id);

  let reminderCount = 0;
  if (candidateIds.length > 0) {
    const { data: alreadyRated } = await service.from("ratings").select("order_id").in("order_id", candidateIds);
    const ratedIds = new Set((alreadyRated ?? []).map((r) => r.order_id));
    const unratedIds = candidateIds.filter((id) => !ratedIds.has(id));

    for (const orderId of unratedIds) {
      const { error } = await service
        .from("orders")
        .update({ rating_reminder_sent_at: new Date().toISOString() })
        .eq("id", orderId)
        .is("rating_reminder_sent_at", null);

      if (!error) {
        track("rating_prompt_shown", { order_id: orderId });
        reminderCount++;
      }
    }
  }

  return NextResponse.json({ checked: candidateIds.length, remindersSent: reminderCount }, { status: 200 });
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
