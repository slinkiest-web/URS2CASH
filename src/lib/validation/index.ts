/**
 * Shared validation schemas (stub).
 *
 * HARD RULE (PRD §12.1): every write boundary uses Zod.
 * Category attribute schemas live in lib/categories/. This directory
 * holds cross-cutting schemas (e.g. common Nigerian state enum, handle format).
 */
import { z } from "zod";

/** Nigerian states including FCT — used in profile and checkout forms. */
export const nigerianStateSchema = z.enum([
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
]);

export type NigerianState = z.infer<typeof nigerianStateSchema>;

/** Epic A1 AC1: password of 8 or more characters. Mirrors config.toml's minimum_password_length. */
export const authCredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/** Epic A3 AC1: display_name and state are required to complete a seller profile. */
export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(50, "Display name must be at most 50 characters."),
  bio: z.string().trim().max(280, "Bio must be at most 280 characters.").optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9][0-9]{7,14}$/, "Enter a phone number in E.164 format, e.g. +2348012345678.")
    .optional(),
  state: nigerianStateSchema,
  avatarUrl: z.string().trim().url("Enter a valid URL.").optional(),
});
