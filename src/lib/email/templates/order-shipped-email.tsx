import { EmailLayout, EmailText, EmailDetailRow } from "@/lib/email/components/email-layout";

/** §10 Epic D3 AC5: "Buyer notified by email on ship." */
export function OrderShippedEmail({
  listingTitle,
  trackingNote,
  autoReleaseDateFormatted,
}: {
  listingTitle: string;
  trackingNote: string;
  autoReleaseDateFormatted: string;
}) {
  return (
    <EmailLayout previewText={`${listingTitle} has shipped`} heading="Your order has shipped">
      <EmailText>
        The seller has marked <strong>{listingTitle}</strong> as shipped.
      </EmailText>
      <EmailDetailRow label="Tracking note" value={trackingNote} />
      <EmailText>
        Once it arrives, confirm delivery from your orders page to release payment to the seller. If you don&apos;t,
        it releases automatically on <strong>{autoReleaseDateFormatted}</strong>.
      </EmailText>
    </EmailLayout>
  );
}

export default OrderShippedEmail;
