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
