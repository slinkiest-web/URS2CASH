/**
 * Generic, registry-driven listing-attribute display (PRD §10 Epic C3 AC3:
 * "all attributes rendered from the registry with human labels" — fails if
 * hardcoded per category).
 *
 * HARD RULE (§12.3): no switch on category slug anywhere. Every special
 * case below keys off a *field name* or *field kind* that recurs verbatim
 * across categories — `functional_status` is spelled identically in
 * Gadgets (§6.4.3) and Home Goods (§6.4.5); `pao_months`/`opened_at_date`
 * are spelled identically in Beauty (§6.4.1) and Personal Care (§6.4.4).
 * Adding a sixth category with the same field names gets the same
 * treatment for free, with zero changes here.
 */
import { categoryRegistry, type CategorySlug } from "./registry";
import { getAttributeFieldDescriptors, type FieldDescriptor } from "./form-fields";

const ATTRIBUTE_LABELS: Record<string, string> = {
  brand: "Brand",
  model: "Model",
  product_type: "Type",
  storage_gb: "Storage",
  ram_gb: "RAM",
  colour: "Colour",
  functional_status: "Functional status",
  cosmetic_grade: "Cosmetic grade",
  screen_condition: "Screen condition",
  battery_health_percent: "Battery health",
  icloud_or_frp_locked: "iCloud/FRP locked",
  carrier_locked: "Carrier locked",
  has_original_packaging: "Original packaging",
  included_accessories: "Included accessories",
  declared_weight_kg: "Weight",
  longest_dimension_cm: "Longest dimension",
  size_system: "Size system",
  size_value: "Size",
  material: "Material",
  gender: "Gender",
  measurements_cm: "Measurements",
  times_worn_band: "Times worn",
  wear_signs: "Wear signs",
  shade: "Shade",
  size_unit: "Size unit",
  expiry_date: "Expiry date",
  fill_level_percent: "Fill level",
  pao_months: "Period after opening (PAO)",
  opened_at_date: "Opened on",
  batch_code: "Batch code",
  is_prescription: "Prescription item",
  skin_or_hair_type: "Skin/hair type",
  key_ingredients: "Key ingredients",
  set_quantity: "Set quantity",
  is_powered: "Powered",
  is_fragile: "Fragile",
  chest: "Chest",
  waist: "Waist",
  hips: "Hips",
  length: "Length",
  inseam: "Inseam",
};

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function attributeLabel(name: string): string {
  return ATTRIBUTE_LABELS[name] ?? humanize(name);
}

/** Suffix-driven unit formatting — generic across every category, never keyed by category name. */
function unitSuffix(name: string): string {
  if (name.endsWith("_percent")) return "%";
  if (name.endsWith("_kg")) return " kg";
  if (name.endsWith("_cm")) return " cm";
  if (name.endsWith("_gb")) return " GB";
  return "";
}

function formatDate(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
}

function formatValue(name: string, kind: FieldDescriptor["kind"], value: unknown): string {
  if (kind === "boolean") return value ? "Yes" : "No";
  if (kind === "date") return formatDate(value);
  if (kind === "enum") return humanize(String(value));
  if (kind === "enum-array" || kind === "string-array") {
    const arr = Array.isArray(value) ? value : [];
    if (arr.length === 0) return "—";
    return arr.map((v) => (kind === "enum-array" ? humanize(String(v)) : String(v))).join(", ");
  }
  if (kind === "number") return `${String(value)}${unitSuffix(name)}`;
  return String(value);
}

export type DisplayAttribute = { name: string; label: string; value: string };

export type ListingAttributeDisplay = {
  /**
   * Two-claims / usage-indicator fields shown with equal prominence to
   * `condition`, never buried in the general table (§6.4.3 HARD RULE: "All
   * three [condition, cosmetic_grade, functional_status] are surfaced with
   * equal prominence on listing detail").
   */
  prominent: DisplayAttribute[];
  /** Every other present scalar/enum/boolean/date/array attribute. */
  table: DisplayAttribute[];
  /**
   * Present only when the category has an object-kind field (e.g. Fashion's
   * `measurements_cm`) with at least one populated sub-value — rendered as
   * its own table, never inlined as a JSON blob (§6.4.2: "measurements shown
   * as a table").
   */
  measurements: DisplayAttribute[] | null;
};

/** Field names that get equal prominence to `condition` wherever they appear — by name, never by category. */
const PROMINENT_FIELD_NAMES = new Set(["functional_status", "cosmetic_grade", "fill_level_percent"]);

/**
 * §6.4.1/§6.4.4 HARD RULE: "opened_at_date is required alongside [pao_months]
 * so remaining PAO is computable and displayable." Both fields are folded
 * into a single computed entry rather than shown as two raw values.
 */
function computeRemainingPao(paoMonths: unknown, openedAtDate: unknown): DisplayAttribute | null {
  const months = Number(paoMonths);
  const opened = openedAtDate instanceof Date ? openedAtDate : new Date(String(openedAtDate));
  if (paoMonths === undefined || openedAtDate === undefined || !Number.isFinite(months) || Number.isNaN(opened.getTime())) {
    return null;
  }

  const expiresAt = new Date(opened);
  expiresAt.setMonth(expiresAt.getMonth() + months);
  const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const expiresLabel = formatDate(expiresAt);
  const value = daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left (until ${expiresLabel})` : `Expired ${expiresLabel}`;

  return { name: "remaining_pao", label: "Remaining PAO", value };
}

/**
 * Builds the display model for a listing's category attributes. `condition`
 * is deliberately not accepted here — it's a real `listings` column rendered
 * separately in the page's core-detail section (PRD §6.1/§7.1), not part of
 * category `attributes`.
 */
export function buildAttributeDisplay(
  categorySlug: CategorySlug,
  attributes: Record<string, unknown>
): ListingAttributeDisplay {
  const config = categoryRegistry[categorySlug];
  const descriptors = getAttributeFieldDescriptors(config.schema);

  const prominent: DisplayAttribute[] = [];
  const table: DisplayAttribute[] = [];
  let measurements: DisplayAttribute[] | null = null;

  const paoEntry = computeRemainingPao(attributes["pao_months"], attributes["opened_at_date"]);

  for (const field of descriptors) {
    if (config.adminOnlyAttributeFields.includes(field.name)) continue;
    if (field.name === "pao_months" || field.name === "opened_at_date") continue; // folded into remaining-PAO below

    const raw = attributes[field.name];
    if (raw === undefined || raw === null) continue;

    if (field.kind === "object") {
      // Sub-field names (e.g. `chest`, `length`) carry no unit suffix of
      // their own — the unit lives on the parent object's name instead
      // (`measurements_cm`). Derived from that suffix, generically, so a
      // future object-kind field named `weights_kg` would get the same
      // treatment with no changes here.
      const parentUnit = unitSuffix(field.name);
      const subRows: DisplayAttribute[] = [];
      for (const sub of field.fields) {
        const subRaw = (raw as Record<string, unknown>)[sub.name];
        if (subRaw === undefined || subRaw === null) continue;
        const value =
          sub.kind === "number" && parentUnit ? `${String(subRaw)}${parentUnit}` : formatValue(sub.name, sub.kind, subRaw);
        subRows.push({ name: sub.name, label: attributeLabel(sub.name), value });
      }
      if (subRows.length > 0) measurements = subRows;
      continue;
    }

    const entry: DisplayAttribute = {
      name: field.name,
      label: attributeLabel(field.name),
      value: formatValue(field.name, field.kind, raw),
    };
    if (PROMINENT_FIELD_NAMES.has(field.name)) {
      prominent.push(entry);
    } else {
      table.push(entry);
    }
  }

  if (paoEntry) prominent.push(paoEntry);

  return { prominent, table, measurements };
}
