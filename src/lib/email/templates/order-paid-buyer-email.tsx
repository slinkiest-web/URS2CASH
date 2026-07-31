import { EmailLayout, EmailText, EmailDetailRow } from "@/lib/email/components/email-layout";

/**
 * §10 Epic D2 AC6 / §9.1: fires exactly at `paid` — the seller's
 * `display_name` and fulfilment phone number are the only seller contact
 * details ever released to a buyer (§9.1's own list), and never before
 * this moment. `sellerPhone` may be null (a seller who hasn't set
 * `profiles.phone`) — rendered as a plain notice, not a broken value.
 */
export function OrderPaidBuyerEmail({
  listingTitle,
  amountFormatted,
  sellerDisplayName,
  sellerPhone,
}: {
  listingTitle: string;
  amountFormatted: string;
  sellerDisplayName: string;
  sellerPhone: string | null;
}) {
  return (
    <EmailLayout previewText={`Payment confirmed for ${listingTitle}`} heading="Payment confirmed">
      <EmailText>
        Your payment for <strong>{listingTitle}</strong> is confirmed. The seller has been notified and will arrange
        delivery with you directly.
      </EmailText>
      <EmailDetailRow label="Amount paid" value={amountFormatted} />
      <EmailDetailRow label="Seller" value={sellerDisplayName} />
      {sellerPhone ? (
        <EmailDetailRow label="Seller phone" value={sellerPhone} />
      ) : (
        <EmailText>The seller hasn&apos;t provided a phone number yet — contact support if you need help reaching them.</EmailText>
      )}
      <EmailText>
        The amount above doesn&apos;t include delivery — agree the delivery cost and method directly with the seller
        using the contact details above.
      </EmailText>
    </EmailLayout>
  );
}

export default OrderPaidBuyerEmail;
