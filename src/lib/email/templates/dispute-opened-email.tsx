import { EmailLayout, EmailText, EmailDetailRow } from "@/lib/email/components/email-layout";

const REASON_LABELS: Record<string, string> = {
  not_received: "Item not received",
  not_as_described: "Not as described",
  damaged: "Damaged",
  wrong_item: "Wrong item",
  counterfeit: "Counterfeit",
  shipping_cost_dispute: "Shipping cost dispute",
  other: "Other",
};

/** §10 Epic D5 AC6: "Both parties and admin notified." One template, three recipient framings. */
export function DisputeOpenedEmail({
  recipientRole,
  listingTitle,
  reason,
  detail,
}: {
  recipientRole: "buyer" | "seller" | "admin";
  listingTitle: string;
  reason: string;
  detail: string;
}) {
  const intro =
    recipientRole === "buyer"
      ? `You've raised a dispute on your order for ${listingTitle}. An admin will review it.`
      : recipientRole === "seller"
        ? `A buyer has raised a dispute on the order for ${listingTitle}. An admin will review it — no action is needed from you yet.`
        : `A dispute was raised on an order for ${listingTitle} and needs review.`;

  return (
    <EmailLayout previewText={`Dispute opened: ${listingTitle}`} heading="Dispute opened">
      <EmailText>{intro}</EmailText>
      <EmailDetailRow label="Reason" value={REASON_LABELS[reason] ?? reason} />
      <EmailDetailRow label="Details" value={detail} />
    </EmailLayout>
  );
}

export default DisputeOpenedEmail;
