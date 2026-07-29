import type { DisplayAttribute } from "@/lib/categories/attribute-display";

/**
 * Renders any `DisplayAttribute[]` as a labelled table — used for both the
 * general attribute table and the measurements sub-table (PRD §10 Epic C3
 * AC3: "all attributes rendered from the registry with human labels").
 * Never hardcoded per category: the caller decides which rows go here.
 */
export function AttributeTable({ heading, rows }: { heading: string; rows: DisplayAttribute[] }) {
  if (rows.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{heading}</h2>
      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.name}
            className="flex items-baseline justify-between gap-4 border-b border-zinc-100 py-1.5 text-sm dark:border-zinc-900"
          >
            <dt className="text-zinc-500 dark:text-zinc-400">{row.label}</dt>
            <dd className="text-right font-medium text-zinc-900 dark:text-zinc-50">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
