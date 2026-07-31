import { EmailLayout, EmailText, EmailDetailRow } from "@/lib/email/components/email-layout";

/** §10 Epic E3 AC6: "Seller emailed on paid." */
export function PayoutPaidEmail({
  amountFormatted,
  adminReference,
}: {
  amountFormatted: string;
  adminReference: string;
}) {
  return (
    <EmailLayout previewText={`Payout sent: ${amountFormatted}`} heading="Your payout has been sent">
      <EmailText>Your payout has been sent to your registered bank account.</EmailText>
      <EmailDetailRow label="Amount" value={amountFormatted} />
      <EmailDetailRow label="Reference" value={adminReference} />
    </EmailLayout>
  );
}

export default PayoutPaidEmail;
