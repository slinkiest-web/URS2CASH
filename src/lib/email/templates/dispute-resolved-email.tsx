import { EmailLayout, EmailText, EmailDetailRow } from "@/lib/email/components/email-layout";

/** §10 Epic E2 AC5: "Both parties emailed the outcome." One template, framed per recipient and outcome. */
export function DisputeResolvedEmail({
  recipientRole,
  outcome,
  listingTitle,
  notes,
}: {
  recipientRole: "buyer" | "seller";
  outcome: "buyer" | "seller";
  listingTitle: string;
  notes: string;
}) {
  const wonIt = recipientRole === outcome;
  const summary =
    outcome === "seller"
      ? wonIt
        ? `The dispute on ${listingTitle} was resolved in your favour — funds have been released.`
        : `The dispute on ${listingTitle} was resolved in the seller's favour — funds have been released to them.`
      : wonIt
        ? `The dispute on ${listingTitle} was resolved in your favour — you're being refunded.`
        : `The dispute on ${listingTitle} was resolved in the buyer's favour — they're being refunded.`;

  return (
    <EmailLayout previewText={`Dispute resolved: ${listingTitle}`} heading="Dispute resolved">
      <EmailText>{summary}</EmailText>
      <EmailDetailRow label="Admin notes" value={notes} />
    </EmailLayout>
  );
}

export default DisputeResolvedEmail;
