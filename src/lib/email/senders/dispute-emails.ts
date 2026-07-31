import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sendEmail } from "@/lib/email/send-email";
import { getUserEmail } from "@/lib/email/get-user-email";
import { DisputeOpenedEmail } from "@/lib/email/templates/dispute-opened-email";
import { DisputeResolvedEmail } from "@/lib/email/templates/dispute-resolved-email";

type ServiceClient = SupabaseClient<Database>;

async function getDisputeContext(service: ServiceClient, disputeId: string) {
  const { data: dispute } = await service.from("disputes").select("order_id, reason, detail, admin_notes").eq("id", disputeId).maybeSingle();
  if (!dispute) return null;

  const { data: order } = await service.from("orders").select("buyer_id, seller_id, listing_id").eq("id", dispute.order_id).maybeSingle();
  if (!order) return null;

  const { data: listing } = await service.from("listings").select("title").eq("id", order.listing_id).maybeSingle();

  return { dispute, order, listingTitle: listing?.title ?? "an order" };
}

/**
 * §10 Epic D5 AC6: "Both parties and admin notified." `ADMIN_ALERT_EMAIL`
 * is a new server-only env var for exactly this — distinct from
 * `NEXT_PUBLIC_SUPPORT_EMAIL` (a buyer-facing contact link, §9.1) since
 * this is an internal operational alert address, not a public one.
 * No-ops the admin leg (logged) if unset, same "not configured" posture as
 * every other optional integration in this codebase.
 */
export async function sendDisputeOpenedEmails(service: ServiceClient, disputeId: string): Promise<void> {
  const context = await getDisputeContext(service, disputeId);
  if (!context) return;
  const { dispute, order, listingTitle } = context;

  const [buyerEmail, sellerEmail] = await Promise.all([
    getUserEmail(service, order.buyer_id),
    getUserEmail(service, order.seller_id),
  ]);

  const sends: Promise<unknown>[] = [];

  if (buyerEmail) {
    sends.push(
      sendEmail({
        to: buyerEmail,
        subject: `Dispute opened — ${listingTitle}`,
        react: DisputeOpenedEmail({ recipientRole: "buyer", listingTitle, reason: dispute.reason, detail: dispute.detail }),
      })
    );
  }
  if (sellerEmail) {
    sends.push(
      sendEmail({
        to: sellerEmail,
        subject: `Dispute opened — ${listingTitle}`,
        react: DisputeOpenedEmail({ recipientRole: "seller", listingTitle, reason: dispute.reason, detail: dispute.detail }),
      })
    );
  }

  const adminEmail = process.env["ADMIN_ALERT_EMAIL"];
  if (adminEmail) {
    sends.push(
      sendEmail({
        to: adminEmail,
        subject: `[Dispute] ${listingTitle}`,
        react: DisputeOpenedEmail({ recipientRole: "admin", listingTitle, reason: dispute.reason, detail: dispute.detail }),
      })
    );
  } else {
    console.log("[email] ADMIN_ALERT_EMAIL not set — skipping admin dispute-opened notification");
  }

  await Promise.all(sends);
}

/** §10 Epic E2 AC5: "Both parties emailed the outcome." */
export async function sendDisputeResolvedEmails(service: ServiceClient, disputeId: string): Promise<void> {
  const { data: dispute } = await service.from("disputes").select("order_id, status, admin_notes").eq("id", disputeId).maybeSingle();
  if (!dispute || !dispute.admin_notes) return;

  const outcome: "buyer" | "seller" = dispute.status === "resolved_buyer" ? "buyer" : "seller";

  const { data: order } = await service.from("orders").select("buyer_id, seller_id, listing_id").eq("id", dispute.order_id).maybeSingle();
  if (!order) return;

  const [{ data: listing }, buyerEmail, sellerEmail] = await Promise.all([
    service.from("listings").select("title").eq("id", order.listing_id).maybeSingle(),
    getUserEmail(service, order.buyer_id),
    getUserEmail(service, order.seller_id),
  ]);
  const listingTitle = listing?.title ?? "an order";

  const sends: Promise<unknown>[] = [];
  if (buyerEmail) {
    sends.push(
      sendEmail({
        to: buyerEmail,
        subject: `Dispute resolved — ${listingTitle}`,
        react: DisputeResolvedEmail({ recipientRole: "buyer", outcome, listingTitle, notes: dispute.admin_notes }),
      })
    );
  }
  if (sellerEmail) {
    sends.push(
      sendEmail({
        to: sellerEmail,
        subject: `Dispute resolved — ${listingTitle}`,
        react: DisputeResolvedEmail({ recipientRole: "seller", outcome, listingTitle, notes: dispute.admin_notes }),
      })
    );
  }

  await Promise.all(sends);
}
