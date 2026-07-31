import { EmailLayout, EmailText, EmailDetailRow } from "@/lib/email/components/email-layout";

/**
 * §10 Epic D2 AC6 / §9.1: the buyer's `delivery_name`/`delivery_phone`/
 * `delivery_address`/`delivery_state` — §9.1's exact list of what a seller
 * receives, and only at `paid`, never before.
 */
export function OrderPaidSellerEmail({
  listingTitle,
  payoutFormatted,
  buyerName,
  buyerPhone,
  buyerAddress,
  buyerState,
}: {
  listingTitle: string;
  payoutFormatted: string;
  buyerName: string;
  buyerPhone: string;
  buyerAddress: string;
  buyerState: string;
}) {
  return (
    <EmailLayout previewText={`${listingTitle} sold — arrange delivery`} heading="Item sold — arrange delivery">
      <EmailText>
        <strong>{listingTitle}</strong> is paid for. Arrange delivery directly with the buyer using the details
        below, then mark the order as shipped from your dashboard once it&apos;s on its way.
      </EmailText>
      <EmailDetailRow label="Buyer" value={buyerName} />
      <EmailDetailRow label="Phone" value={buyerPhone} />
      <EmailDetailRow label="Delivery address" value={`${buyerAddress}, ${buyerState}`} />
      <EmailDetailRow label="Your payout (after 10% commission)" value={payoutFormatted} />
      <EmailText>Your payout is released once the buyer confirms delivery (or automatically after 7 days if she doesn&apos;t).</EmailText>
    </EmailLayout>
  );
}

export default OrderPaidSellerEmail;
