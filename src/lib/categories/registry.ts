/**
 * Category schema registry (stub).
 *
 * HARD RULE (PRD §6.5): categories are resolved dynamically by slug.
 * No switch statement over category names anywhere in the codebase.
 *
 * This file will be populated in the next prompt (auth + profiles migration).
 * Each category exports: { schema, version, photoMin, allowedConditions, rules }
 */

// Placeholder type — replaced when category schemas are written.
export type CategoryRegistry = Record<string, never>;

/** Placeholder registry — populated in the category implementation prompt. */
export const categoryRegistry: CategoryRegistry = {};
