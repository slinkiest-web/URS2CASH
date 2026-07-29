/**
 * Shared constants and helpers for category attribute schemas (PRD §6).
 */

/**
 * PRD §6.3: condition is a real column on `listings`, a fixed enum of
 * exactly three values, never free text. Each category schema below embeds
 * `condition` as a field — even though it persists to a real column, not
 * JSONB `attributes` (PRD §6.1/§7.1) — because every category's conditional
 * business rules key off it. The resolver's caller is responsible for
 * splitting `condition` out of the validated result before writing:
 * `condition` → `listings.condition`, everything else → `listings.attributes`.
 */
export const ALL_CONDITIONS = ["brand_new", "opened_unused", "used"] as const;
export type ConditionValue = (typeof ALL_CONDITIONS)[number];

/**
 * PRD §6.3's condition table verbatim — label plus the exact "definition
 * shown to seller" text, reused on listing detail (§10 Epic C3 AC4: "full
 * definition text, not just the label").
 */
export const CONDITION_DEFINITIONS: Record<ConditionValue, { label: string; definition: string }> = {
  brand_new: { label: "Brand New", definition: "Unopened, sealed, in original packaging" },
  opened_unused: {
    label: "Opened but Unused",
    definition: "Seal broken or box opened, never used, all components present",
  },
  used: { label: "Used", definition: "Has been used at any amount" },
};

/** A `Date` `days` in the future from `from` (defaults to now). */
export function daysFromNow(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

/** True when `date` is strictly before `reference` (defaults to now). */
export function isPastDate(date: Date, reference: Date = new Date()): boolean {
  return date.getTime() < reference.getTime();
}
