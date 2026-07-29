"use client";

import { track } from "@/lib/analytics/events";

/**
 * PRD §9.1 HARD RULE: there is no buyer-to-seller contact mechanism, pre or
 * post purchase, of any form. This is the *only* contact affordance on
 * listing detail, and it routes to platform support, never the seller
 * (§5.2: "the support route is a contact link in MVP" — not in-app
 * ticketing, which is explicitly out of scope). A small client boundary is
 * required only to fire `support_contact_opened` on click; everything else
 * on the page stays a Server Component.
 */
export function SupportLink({
  listingId,
  categorySlug,
  supportEmail,
}: {
  listingId: string;
  categorySlug: string;
  supportEmail: string;
}) {
  return (
    <a
      href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Question about a listing (${listingId})`)}`}
      onClick={() => track("support_contact_opened", { listing_id: listingId, category_id: categorySlug })}
      className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
    >
      Question about this item?
    </a>
  );
}
