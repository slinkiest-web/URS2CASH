import { EmailLayout, EmailText, EmailDetailRow } from "@/lib/email/components/email-layout";

/** §10 Epic E1 AC3: "Suspension sets listings.status = 'suspended'... and emails the seller with the reason." */
export function ListingSuspendedEmail({
  listingTitle,
  reason,
}: {
  listingTitle: string;
  reason: string;
}) {
  return (
    <EmailLayout previewText={`Your listing "${listingTitle}" has been suspended`} heading="Listing suspended">
      <EmailText>
        Your listing <strong>{listingTitle}</strong> has been suspended and is no longer visible to buyers.
      </EmailText>
      <EmailDetailRow label="Reason" value={reason} />
      <EmailText>Contact support if you have questions about this decision.</EmailText>
    </EmailLayout>
  );
}

export default ListingSuspendedEmail;
