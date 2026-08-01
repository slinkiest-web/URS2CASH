/**
 * Checkout input validation (PRD §10 Epic D1 AC2, §11.2 `initiateCheckout`).
 *
 * §7.1's `orders` table has exactly four delivery columns —
 * `delivery_name`, `delivery_state`, `delivery_address`, `delivery_phone`.
 * There is no `delivery_city` anywhere in the PRD (grepped §7.1's table and
 * §9.1's release list, zero hits); a full street address is expected to
 * carry the city inline, same as `delivery_address` already does for every
 * other address component. Four fields here, not five.
 */
import { z } from "zod";
import { nigerianStateSchema, nigerianPhoneSchema } from "@/lib/validation";

export const checkoutInputSchema = z.object({
  listingId: z.string().uuid(),
  deliveryName: z
    .string()
    .trim()
    .min(2, "Enter the recipient's full name.")
    .max(100, "Name must be at most 100 characters."),
  deliveryPhone: nigerianPhoneSchema,
  deliveryAddress: z
    .string()
    .trim()
    .min(10, "Enter a full delivery address, including city.")
    .max(500, "Address must be at most 500 characters."),
  deliveryState: nigerianStateSchema,
});

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
