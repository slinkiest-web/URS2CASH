import { EmailLayout, EmailText, EmailDetailRow } from "@/lib/email/components/email-layout";

/** §10 Epic D4 AC7: "Seller notified on release." */
export function OrderReleasedEmail({
  listingTitle,
  payoutFormatted,
}: {
  listingTitle: string;
  payoutFormatted: string;
}) {
  return (
    <EmailLayout previewText={`Funds queued for ${listingTitle}`} heading="Funds queued for payout">
      <EmailText>
        The sale of <strong>{listingTitle}</strong> is complete — delivery is confirmed and your payout is now
        queued.
      </EmailText>
      <EmailDetailRow label="Payout amount" value={payoutFormatted} />
      <EmailText>Payouts are sent manually by the Urs2Cash team. You&apos;ll be emailed again once it&apos;s paid.</EmailText>
    </EmailLayout>
  );
}

export default OrderReleasedEmail;
