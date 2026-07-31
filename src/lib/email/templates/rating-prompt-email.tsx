import { EmailLayout, EmailText } from "@/lib/email/components/email-layout";

/**
 * §10 Epic D6 AC10: "Buyer is emailed a rating prompt on release. One
 * reminder at 72 hours if unrated. No further reminders." `isReminder`
 * only changes the copy — the sender enforces "no further reminders" via
 * `orders.rating_reminder_sent_at`, not this template.
 */
export function RatingPromptEmail({
  listingTitle,
  sellerDisplayName,
  orderUrl,
  isReminder,
}: {
  listingTitle: string;
  sellerDisplayName: string;
  orderUrl: string;
  isReminder: boolean;
}) {
  return (
    <EmailLayout
      previewText={isReminder ? `Reminder: rate your purchase of ${listingTitle}` : `Rate your purchase of ${listingTitle}`}
      heading={isReminder ? "Still time to rate your purchase" : "How was your purchase?"}
    >
      <EmailText>
        {isReminder
          ? `Just a reminder — you haven't rated ${sellerDisplayName} yet for `
          : `Your order for `}
        <strong>{listingTitle}</strong>
        {isReminder ? "." : ` from ${sellerDisplayName} is complete.`} Your rating helps other buyers trust the
        platform.
      </EmailText>
      <EmailText>
        <a href={orderUrl} style={{ color: "#18181b", fontWeight: 600 }}>
          Leave a rating →
        </a>
      </EmailText>
    </EmailLayout>
  );
}

export default RatingPromptEmail;
