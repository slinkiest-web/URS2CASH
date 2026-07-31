import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sendEmail } from "@/lib/email/send-email";
import { getUserEmail } from "@/lib/email/get-user-email";
import { ListingSuspendedEmail } from "@/lib/email/templates/listing-suspended-email";

type ServiceClient = SupabaseClient<Database>;

/** §10 Epic E1 AC3: "emails the seller with the reason." */
export async function sendListingSuspendedEmail(service: ServiceClient, listingId: string): Promise<void> {
  const { data: listing } = await service
    .from("listings")
    .select("title, seller_id, suspension_reason")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || !listing.suspension_reason) return;

  const sellerEmail = await getUserEmail(service, listing.seller_id);
  if (!sellerEmail) return;

  await sendEmail({
    to: sellerEmail,
    subject: `Listing suspended — ${listing.title}`,
    react: ListingSuspendedEmail({ listingTitle: listing.title, reason: listing.suspension_reason }),
  });
}
