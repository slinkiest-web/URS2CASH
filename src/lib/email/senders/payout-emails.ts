import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sendEmail } from "@/lib/email/send-email";
import { getUserEmail } from "@/lib/email/get-user-email";
import { formatKobo } from "@/lib/money";
import { PayoutPaidEmail } from "@/lib/email/templates/payout-paid-email";

type ServiceClient = SupabaseClient<Database>;

/** §10 Epic E3 AC6: "Seller emailed on paid." */
export async function sendPayoutPaidEmail(service: ServiceClient, payoutId: string): Promise<void> {
  const { data: payout } = await service.from("payouts").select("seller_id, amount_kobo, admin_reference").eq("id", payoutId).maybeSingle();
  if (!payout) return;

  const sellerEmail = await getUserEmail(service, payout.seller_id);
  if (!sellerEmail) return;

  await sendEmail({
    to: sellerEmail,
    subject: `Payout sent — ${formatKobo(payout.amount_kobo)}`,
    react: PayoutPaidEmail({
      amountFormatted: formatKobo(payout.amount_kobo),
      adminReference: payout.admin_reference ?? "—",
    }),
  });
}
