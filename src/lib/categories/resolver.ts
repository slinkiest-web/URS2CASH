/**
 * Category attribute resolver. PRD §6.1/§6.5.
 *
 * HARD RULE: this is the only validation path for category attributes.
 * Every write boundary (listing create, update, admin, seeds, migrations)
 * calls this — never an ad-hoc check.
 *
 * `rawAttributes` is expected to include `condition` alongside every
 * category-specific field, because most categories' business rules are
 * conditional on it (PRD §6.3/§6.4) even though `condition` itself persists
 * to a real `listings` column, not the JSONB `attributes` column (§6.1/§7.1).
 * Callers must split the validated result before writing to the database:
 * `condition` → `listings.condition`, everything else → `listings.attributes`.
 */
import { categoryRegistry, type CategoryConfig, type CategorySlug } from "./registry";

export type CategoryValidationIssue = { path: string; message: string };

export type CategoryAttributesResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: "unknown_category" | "validation_error";
        message: string;
        issues: CategoryValidationIssue[];
      };
    };

function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(categoryRegistry, value);
}

export function resolveCategoryAttributes(
  categorySlug: string,
  rawAttributes: unknown
): CategoryAttributesResult {
  if (!isCategorySlug(categorySlug)) {
    return {
      ok: false,
      error: {
        code: "unknown_category",
        message: `Unknown category slug: ${categorySlug}`,
        issues: [],
      },
    };
  }

  const category: CategoryConfig = categoryRegistry[categorySlug];
  const parsed = category.schema.safeParse(rawAttributes);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: issues[0]?.message ?? "Validation failed.",
        issues,
      },
    };
  }

  return { ok: true, data: parsed.data as Record<string, unknown> };
}
