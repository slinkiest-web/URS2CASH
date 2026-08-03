"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { createListing, updateListing } from "@/lib/actions/listings";
import { getAttributeFieldDescriptors, type FieldDescriptor } from "@/lib/categories/form-fields";
import type { CategorySlug, SubcategoryGroups } from "@/lib/categories/registry";
import type { ConditionValue } from "@/lib/categories/shared";
import { categoryRegistry } from "@/lib/categories/registry";
import { uploadListingPhoto } from "@/lib/storage/upload-listing-photo";
import { track } from "@/lib/analytics/track-client";
import { nairaToKobo, formatKobo } from "@/lib/money";
import { TIMES_USED_VALUES, TIMES_USED_LABELS } from "@/lib/listings/schema";

export type SellableCategory = {
  slug: CategorySlug;
  displayName: string;
  browsable: boolean;
  minPhotos: number;
  maxPhotos: number;
  allowedConditions: readonly ConditionValue[];
  usageIndicatorFields: readonly string[];
  /** Present only for categories with a two-level group/subtype taxonomy (Beauty, Fashion). */
  subcategoryGroups?: SubcategoryGroups;
};

/**
 * Renders the group -> subtype pair for a category with `subcategoryGroups`
 * (Beauty, Fashion) — group required, subtype optional and scoped to
 * whichever group is currently selected. Driven entirely by registry data,
 * never by category slug (§12.3) — any future category with the same
 * `subcategoryGroups` shape gets this for free.
 */
function GroupSubtypeSelector({
  groups,
  groupValue,
  subtypeValue,
  onGroupChange,
  onSubtypeChange,
}: {
  groups: SubcategoryGroups;
  groupValue: string;
  subtypeValue: string;
  onGroupChange: (value: string) => void;
  onSubtypeChange: (value: string) => void;
}) {
  const selectedGroup = groupValue ? groups[groupValue] : undefined;
  const subtypeEntries = selectedGroup ? Object.entries(selectedGroup.subtypes) : [];

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Subcategory</span>
        <select value={groupValue} onChange={(e) => onGroupChange(e.target.value)} required className={selectClass}>
          <option value="" disabled>
            Select…
          </option>
          {Object.entries(groups).map(([key, group]) => (
            <option key={key} value={key}>
              {group.label}
            </option>
          ))}
        </select>
      </label>
      {subtypeEntries.length > 0 ? (
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>
            {selectedGroup?.label} type <span className={fieldHintClass}>(optional)</span>
          </span>
          <select value={subtypeValue} onChange={(e) => onSubtypeChange(e.target.value)} className={selectClass}>
            <option value="">Select…</option>
            {subtypeEntries.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}

export type ExistingListing = {
  id: string;
  status: string;
  categorySlug: CategorySlug;
  title: string;
  description: string;
  priceKobo: number;
  condition: string;
  conditionNotes: string | null;
  reasonForSelling: string | null;
  timesUsed: string | null;
  attributes: Record<string, unknown>;
  photoUrls: string[];
  flawPhotoIndexes: number[];
};

/** PRD §6.2 HARD RULE: verbatim notice for a listable-but-not-browsable category. */
const FOUNDING_SELLER_NOTICE =
  "This category is opening soon. Your listing goes live immediately and can be found through search and shared by link. The category opens to browsing as more sellers list.";

/** §10 Epic B2 AC1: localStorage draft key, restored on a fresh /sell visit only. */
const DRAFT_STORAGE_KEY = "urs2cash:sell-draft";
const AUTOSAVE_DEBOUNCE_MS = 500;

type StoredDraft = {
  categorySlug: string;
  condition: string;
  title: string;
  description: string;
  priceNaira: string;
  conditionNotes: string;
  reasonForSelling: string;
  timesUsed: string;
  hasFlaws: boolean;
  attributeValues: Record<string, unknown>;
};

function readStoredDraft(): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

type PhotoState = {
  id: string;
  /** null for a photo that was already uploaded before this session (edit/resume). */
  file: File | null;
  previewUrl: string;
  uploadedUrl: string | null;
  uploading: boolean;
  error: string | null;
};

function humanizeFieldName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const fieldLabelClass = "text-[13px] font-bold text-u2c-ink";
const fieldHintClass = "text-[13px] font-normal text-u2c-ink-soft normal-case";
const inputBaseClass =
  "h-11 rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-surface px-3 text-[15px] text-u2c-ink outline-none placeholder:text-u2c-ink-soft focus:border-u2c-focus focus:ring-2 focus:ring-u2c-focus/20";
const textareaClass =
  "rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-surface px-3 py-2.5 text-[15px] text-u2c-ink outline-none placeholder:text-u2c-ink-soft focus:border-u2c-focus focus:ring-2 focus:ring-u2c-focus/20";
const selectClass = inputBaseClass;

function AttributeFieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = `${humanizeFieldName(field.name)}${field.required ? "" : " (optional)"}`;

  switch (field.kind) {
    case "enum":
      return (
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>{label}</span>
          <select
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={selectClass}
          >
            <option value="">Select…</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {humanizeFieldName(option)}
              </option>
            ))}
          </select>
        </label>
      );
    case "enum-array": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="flex flex-col gap-1.5">
          <legend className={fieldLabelClass}>{label}</legend>
          <div className="flex flex-wrap gap-3">
            {field.options.map((option) => (
              <label key={option} className="flex items-center gap-1.5 text-[14px] text-u2c-ink">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, option]
                      : selected.filter((o) => o !== option);
                    onChange(next);
                  }}
                />
                {humanizeFieldName(option)}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-[14px] font-medium text-u2c-ink">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {label}
        </label>
      );
    case "number":
      return (
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>{label}</span>
          <input
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            className={inputBaseClass}
          />
        </label>
      );
    case "date":
      return (
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>{label}</span>
          <input
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={inputBaseClass}
          />
        </label>
      );
    case "string-array": {
      const items = Array.isArray(value) ? (value as string[]) : [];
      return (
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>{label}</span>
          <input
            type="text"
            placeholder="Comma-separated"
            defaultValue={items.join(", ")}
            onBlur={(e) =>
              onChange(
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            className={inputBaseClass}
          />
        </label>
      );
    }
    case "object": {
      const nested = (value as Record<string, unknown>) ?? {};
      return (
        <fieldset className="flex flex-col gap-3 rounded-[var(--u2c-radius-card)] border border-u2c-line p-3">
          <legend className={fieldLabelClass}>{humanizeFieldName(field.name)}</legend>
          {field.fields.map((nestedField) => (
            <AttributeFieldInput
              key={nestedField.name}
              field={nestedField}
              value={nested[nestedField.name]}
              onChange={(v) => onChange({ ...nested, [nestedField.name]: v })}
            />
          ))}
        </fieldset>
      );
    }
    case "string":
    default:
      return (
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>{label}</span>
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={inputBaseClass}
          />
        </label>
      );
  }
}

export function ListingForm({
  categories,
  sellerId,
  isFirstListing,
  existingListing,
  defaultCategorySlug,
}: {
  categories: SellableCategory[];
  sellerId: string;
  isFirstListing: boolean;
  existingListing?: ExistingListing;
  defaultCategorySlug?: CategorySlug;
}) {
  const router = useRouter();
  const isEditing = existingListing !== undefined;
  const isPublishedEdit = existingListing?.status === "published";

  const [categorySlug, setCategorySlug] = useState<CategorySlug | "">(
    existingListing?.categorySlug ?? defaultCategorySlug ?? ""
  );
  const [draftStartedAt, setDraftStartedAt] = useState<number | null>(() =>
    existingListing || defaultCategorySlug ? Date.now() : null
  );
  const [condition, setCondition] = useState(existingListing?.condition ?? "");
  const [attributeValues, setAttributeValues] = useState<Record<string, unknown>>(
    existingListing?.attributes ?? {}
  );
  const [title, setTitle] = useState(existingListing?.title ?? "");
  const [description, setDescription] = useState(existingListing?.description ?? "");
  const [priceNaira, setPriceNaira] = useState(
    existingListing ? String(existingListing.priceKobo / 100) : ""
  );
  const [reasonForSelling, setReasonForSelling] = useState(existingListing?.reasonForSelling ?? "");
  const [timesUsed, setTimesUsed] = useState(existingListing?.timesUsed ?? "");
  // "Does this item have any flaws?" — independent of condition, always
  // optional, never blocking. Pre-checked on edit only if there's already
  // something to show for it.
  const [hasFlaws, setHasFlaws] = useState(
    Boolean(existingListing?.conditionNotes) || Boolean(existingListing?.flawPhotoIndexes.length)
  );
  const [conditionNotes, setConditionNotes] = useState(existingListing?.conditionNotes ?? "");
  const [photos, setPhotos] = useState<PhotoState[]>(() =>
    (existingListing?.photoUrls ?? []).map((url) => ({
      id: crypto.randomUUID(),
      file: null,
      previewUrl: url,
      uploadedUrl: url,
      uploading: false,
      error: null,
    }))
  );
  const [flawPhotoIndexes, setFlawPhotoIndexes] = useState<number[]>(existingListing?.flawPhotoIndexes ?? []);
  const [submitting, setSubmitting] = useState<"draft" | "publish" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishedListingId, setPublishedListingId] = useState<string | null>(null);
  const [restoredFromLocalDraft, setRestoredFromLocalDraft] = useState(false);

  // §10 Epic B2 AC1: restore an in-progress draft from localStorage after a
  // dropped connection or closed tab — client-only, runs once after mount so
  // it never disagrees with the server-rendered HTML during hydration. Never
  // applies while editing/resuming a specific (server-persisted) listing.
  useEffect(() => {
    if (isEditing) return;
    const draft = readStoredDraft();
    if (!draft || !draft.categorySlug) return;
    // One-time hydration of controlled field state from a client-only
    // external source (localStorage) — must happen post-mount to avoid an
    // SSR hydration mismatch, so it can't be computed during render. Each
    // field is independently editable afterward, which rules out
    // useSyncExternalStore (built for continuously-mirrored external state,
    // not a one-shot seed of otherwise-local state).
    /* eslint-disable react-hooks/set-state-in-effect */
    setCategorySlug(draft.categorySlug as CategorySlug);
    setCondition(draft.condition);
    setTitle(draft.title);
    setDescription(draft.description);
    setPriceNaira(draft.priceNaira);
    setConditionNotes(draft.conditionNotes);
    setReasonForSelling(draft.reasonForSelling ?? "");
    setTimesUsed(draft.timesUsed ?? "");
    setHasFlaws(draft.hasFlaws ?? false);
    setAttributeValues(draft.attributeValues);
    setDraftStartedAt(Date.now());
    setRestoredFromLocalDraft(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  // Debounced autosave to localStorage (§10 Epic B2 AC1: 500ms). Photos
  // (File objects) can't be JSON-serialised and are intentionally excluded —
  // this covers the "dropped connection while typing" case, not photo state.
  useEffect(() => {
    if (isEditing) return;
    const timeout = setTimeout(() => {
      if (!categorySlug) {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        return;
      }
      const draft: StoredDraft = {
        categorySlug,
        condition,
        title,
        description,
        priceNaira,
        conditionNotes,
        reasonForSelling,
        timesUsed,
        hasFlaws,
        attributeValues,
      };
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [
    isEditing,
    categorySlug,
    condition,
    title,
    description,
    priceNaira,
    conditionNotes,
    reasonForSelling,
    timesUsed,
    hasFlaws,
    attributeValues,
  ]);

  const selectedCategory = categories.find((c) => c.slug === categorySlug);

  function handleCategoryChange(slug: string) {
    const nextSlug = slug as CategorySlug;
    setCategorySlug(nextSlug);
    setCondition("");
    setPhotos([]);
    setFlawPhotoIndexes([]);
    setDraftStartedAt(Date.now());

    const category = categories.find((c) => c.slug === nextSlug);
    if (category) {
      // §3.5 `listing_draft_started` — fires once the form is meaningfully
      // opened for a category (category_id is a required property).
      track("listing_draft_started", { category_id: category.slug, is_first_listing: isFirstListing });
    }

    // Gender is required-with-a-default at the schema level (never a
    // blocking blank dropdown) — pre-selecting it here so the UI shows that
    // default immediately, one tap to change rather than a barrier. Keyed
    // on field *name*, not category slug — any category whose schema has a
    // `gender` field gets this for free.
    const hasGenderField = category
      ? getAttributeFieldDescriptors(categoryRegistry[nextSlug].schema).some((f) => f.name === "gender")
      : false;
    setAttributeValues(hasGenderField ? { gender: "unisex" } : {});
  }

  async function handlePhotoSelect(fileList: FileList) {
    if (!selectedCategory) return;
    const remainingSlots = selectedCategory.maxPhotos - photos.length;
    const files = Array.from(fileList).slice(0, Math.max(0, remainingSlots));

    const newPhotos: PhotoState[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      uploadedUrl: null,
      uploading: true,
      error: null,
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);

    await Promise.all(
      newPhotos.map(async (photo) => {
        const result = await uploadListingPhoto(photo.file as File, sellerId);
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id
              ? result.ok
                ? { ...p, uploading: false, uploadedUrl: result.url }
                : { ...p, uploading: false, error: result.error }
              : p
          )
        );
      })
    );
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const index = prev.findIndex((p) => p.id === id);
      if (index === -1) return prev;
      const target = prev[index];
      if (target?.file) URL.revokeObjectURL(target.previewUrl);
      setFlawPhotoIndexes((old) => old.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)));
      return prev.filter((p) => p.id !== id);
    });
  }

  function toggleFlawPhoto(index: number) {
    setFlawPhotoIndexes((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
  }

  function clearLocalDraft() {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedCategory || draftStartedAt === null) return;

    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent: "draft" | "publish" = submitter?.value === "draft" ? "draft" : "publish";

    setSubmitting(intent);
    setSubmitError(null);

    const photoUrls = photos.filter((p) => p.uploadedUrl).map((p) => p.uploadedUrl as string);
    const priceKobo = nairaToKobo(Number(priceNaira) || 0);
    // "Does this item have any flaws?" gates whether conditionNotes/
    // flawPhotoIndexes are sent at all — unchecked means neither, regardless
    // of what's still sitting in local state (e.g. after unticking).
    const submittedConditionNotes = hasFlaws && conditionNotes ? conditionNotes : undefined;
    const submittedFlawPhotoIndexes = hasFlaws ? flawPhotoIndexes : [];

    if (isEditing && existingListing) {
      const result = await updateListing({
        listingId: existingListing.id,
        title,
        description,
        conditionNotes: submittedConditionNotes,
        reasonForSelling: reasonForSelling || undefined,
        timesUsed: timesUsed || undefined,
        attributes: attributeValues,
        photoUrls,
        flawPhotoIndexes: submittedFlawPhotoIndexes,
        // §11.2 HARD RULE: price/condition/category must not even be sent
        // once published — the action rejects the attempt outright if they
        // are present at all, regardless of whether the value changed.
        ...(isPublishedEdit ? {} : { priceKobo, condition, categorySlug: selectedCategory.slug }),
        publish: intent === "publish",
      });

      setSubmitting(null);

      if (!result.ok) {
        setSubmitError(result.error.message);
        return;
      }

      setPublishedListingId(intent === "publish" ? existingListing.id : null);
      if (intent === "draft") {
        setSubmitError(null);
      }
      return;
    }

    const result = await createListing({
      categorySlug: selectedCategory.slug,
      title,
      description,
      priceKobo,
      condition,
      conditionNotes: submittedConditionNotes,
      reasonForSelling: reasonForSelling || undefined,
      timesUsed: timesUsed || undefined,
      attributes: attributeValues,
      photoUrls,
      flawPhotoIndexes: submittedFlawPhotoIndexes,
      draftStartedAt,
      saveAsDraft: intent === "draft",
    });

    setSubmitting(null);

    if (!result.ok) {
      setSubmitError(result.error.message);
      return;
    }

    clearLocalDraft();

    if (intent === "publish") {
      setPublishedListingId(result.data.listingId);
    } else {
      setSubmitError(null);
      router.push(`/sell?listing=${result.data.listingId}`);
    }
  }

  function handleListAnother() {
    if (!publishedListingId) return;
    // §10 Epic B2 AC4.
    track("list_another_clicked", { from_listing_id: publishedListingId });

    // §10 Epic B2 AC3: category, brand, and condition carry over; every
    // other field — including description and photos — starts empty.
    const preservedBrand = attributeValues["brand"];
    const preservedCategory = categorySlug;
    const preservedCondition = condition;

    setPublishedListingId(null);
    setTitle("");
    setDescription("");
    setPriceNaira("");
    setConditionNotes("");
    setReasonForSelling("");
    setTimesUsed("");
    setHasFlaws(false);
    setPhotos([]);
    setFlawPhotoIndexes([]);
    const hasGenderField = preservedCategory
      ? getAttributeFieldDescriptors(categoryRegistry[preservedCategory].schema).some((f) => f.name === "gender")
      : false;
    setAttributeValues({
      ...(preservedBrand !== undefined ? { brand: preservedBrand } : {}),
      ...(hasGenderField ? { gender: "unisex" } : {}),
    });
    setCategorySlug(preservedCategory);
    setCondition(preservedCondition);
    setDraftStartedAt(Date.now());
    setSubmitError(null);
  }

  if (publishedListingId) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <div className="rounded-[var(--u2c-radius-card)] border border-u2c-line bg-u2c-tile p-5 text-[15px] text-u2c-ink">
          <p className="font-display text-lg font-extrabold">Listing published</p>
          <p className="mt-1 text-u2c-ink-soft">It&apos;s live now and can be found through search and by direct link.</p>
        </div>
        {/* §10 Epic B2 AC2: "List another" is the primary action. */}
        <button
          type="button"
          onClick={handleListAnother}
          className="inline-flex h-11 w-fit items-center rounded-[var(--u2c-radius-control)] bg-u2c-primary px-6 text-[13px] font-bold uppercase tracking-[0.03em] text-white transition-colors duration-150 hover:bg-u2c-primary-press"
        >
          List another item
        </button>
        <a href="/dashboard/listings" className="text-[14px] text-u2c-ink-soft underline hover:text-u2c-ink">
          Continue to dashboard
        </a>
      </div>
    );
  }

  const attributeFields = selectedCategory ? getAttributeFieldDescriptors(categoryRegistry[selectedCategory.slug].schema) : [];
  const visibleAttributeFields = attributeFields.filter(
    (field) =>
      // product_group/product_subtype render via the dedicated
      // GroupSubtypeSelector below, never the generic field list.
      field.name !== "product_group" &&
      field.name !== "product_subtype" &&
      (condition === "used" || !selectedCategory?.usageIndicatorFields.includes(field.name))
  );
  // Everyday-seller UX: only genuinely required category attributes show
  // inline. Everything optional (the bulk of most categories' fields) is
  // tucked behind an explicit opt-in, so a first-time seller sees a short
  // form by default instead of every field a category schema supports.
  // Driven entirely by each field's own required/optional flag (derived
  // from the Zod schema, src/lib/categories/form-fields.ts) — no
  // per-category logic here. `gender` is the one name-keyed exception:
  // Zod's `.default()` makes it optional at the schema level (so an
  // omitted value doesn't fail validation), but it's still a field every
  // seller should see and set deliberately, not one that hides behind a
  // disclosure.
  const requiredAttributeFields = visibleAttributeFields.filter((field) => field.required || field.name === "gender");
  const optionalAttributeFields = visibleAttributeFields.filter((field) => !field.required && field.name !== "gender");

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
      {restoredFromLocalDraft ? (
        <p className="rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-tile p-3 text-[14px] text-u2c-ink">
          Restored your unsaved draft from this browser.
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Category</span>
        <select
          value={categorySlug}
          onChange={(e) => handleCategoryChange(e.target.value)}
          required
          disabled={isPublishedEdit}
          className={`${selectClass} disabled:opacity-60`}
        >
          <option value="" disabled>
            Select a category
          </option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.displayName}
            </option>
          ))}
        </select>
        {isPublishedEdit ? (
          <span className="text-[13px] text-u2c-ink-soft">Locked once published. Remove and relist to change it.</span>
        ) : null}
      </label>

      {selectedCategory && !selectedCategory.browsable ? (
        <p className="rounded-[var(--u2c-radius-control)] border border-u2c-line bg-u2c-tile p-3 text-[14px] text-u2c-ink">
          {FOUNDING_SELLER_NOTICE}
        </p>
      ) : null}

      {selectedCategory ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={5}
              maxLength={90}
              required
              placeholder="What are you selling?"
              className={inputBaseClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>
              Description <span className={fieldHintClass}>(optional)</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1500}
              rows={4}
              placeholder="Tell buyers a bit about it. A few honest sentences go a long way."
              className={textareaClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Price (₦)</span>
            <input
              type="number"
              value={priceNaira}
              onChange={(e) => setPriceNaira(e.target.value)}
              min={500}
              max={5000000}
              required
              disabled={isPublishedEdit}
              className={`${inputBaseClass} disabled:opacity-60`}
            />
            {isPublishedEdit ? (
              <span className="text-[13px] text-u2c-ink-soft">
                Locked at {formatKobo(existingListing.priceKobo)} once published. Remove and relist to change it.
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Condition</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              required
              disabled={isPublishedEdit}
              className={`${selectClass} disabled:opacity-60`}
            >
              <option value="" disabled>
                Select condition
              </option>
              {selectedCategory.allowedConditions.map((value) => (
                <option key={value} value={value}>
                  {humanizeFieldName(value)}
                </option>
              ))}
            </select>
            {isPublishedEdit ? (
              <span className="text-[13px] text-u2c-ink-soft">Locked once published. Remove and relist to change it.</span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>
              Reason for selling <span className={fieldHintClass}>(optional)</span>
            </span>
            <input
              type="text"
              value={reasonForSelling}
              onChange={(e) => setReasonForSelling(e.target.value)}
              maxLength={500}
              placeholder="e.g. no longer my size, upgrading, decluttering"
              className={inputBaseClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>
              Times worn or used <span className={fieldHintClass}>(optional)</span>
            </span>
            <select
              value={timesUsed}
              onChange={(e) => setTimesUsed(e.target.value)}
              className={selectClass}
            >
              <option value="">Select…</option>
              {TIMES_USED_VALUES.map((value) => (
                <option key={value} value={value}>
                  {TIMES_USED_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-3 rounded-[var(--u2c-radius-card)] border border-u2c-line bg-u2c-surface p-4">
            <label className="flex items-center gap-2 text-[14px] font-semibold text-u2c-ink">
              <input type="checkbox" checked={hasFlaws} onChange={(e) => setHasFlaws(e.target.checked)} />
              Does this item have any flaws?
            </label>
            {hasFlaws ? (
              <div className="flex flex-col gap-4 border-t border-u2c-line pt-4">
                <label className="flex flex-col gap-1.5">
                  <span className={fieldLabelClass}>
                    Describe the flaw <span className={fieldHintClass}>(optional)</span>
                  </span>
                  <textarea
                    value={conditionNotes}
                    onChange={(e) => setConditionNotes(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    placeholder="e.g. small scratch on the side, light fading on the strap"
                    className={textareaClass}
                  />
                </label>
                {photos.length > 0 ? (
                  <p className="text-[13px] text-u2c-ink-soft">
                    Optionally tag a photo below as showing the flaw.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {selectedCategory.subcategoryGroups ? (
            <GroupSubtypeSelector
              groups={selectedCategory.subcategoryGroups}
              groupValue={typeof attributeValues["product_group"] === "string" ? (attributeValues["product_group"] as string) : ""}
              subtypeValue={typeof attributeValues["product_subtype"] === "string" ? (attributeValues["product_subtype"] as string) : ""}
              onGroupChange={(value) =>
                // Changing group clears any subtype from a different group —
                // never leaves a stale, now-invalid subtype selected.
                setAttributeValues((prev) => ({ ...prev, product_group: value || undefined, product_subtype: undefined }))
              }
              onSubtypeChange={(value) =>
                setAttributeValues((prev) => ({ ...prev, product_subtype: value || undefined }))
              }
            />
          ) : null}

          {requiredAttributeFields.map((field) => (
            <AttributeFieldInput
              key={field.name}
              field={field}
              value={attributeValues[field.name]}
              onChange={(value) => setAttributeValues((prev) => ({ ...prev, [field.name]: value }))}
            />
          ))}

          {optionalAttributeFields.length > 0 ? (
            <details
              className="rounded-[var(--u2c-radius-card)] border border-u2c-line"
              open={optionalAttributeFields.some((field) => {
                const value = attributeValues[field.name];
                return value !== undefined && value !== null && value !== "";
              })}
            >
              <summary className="cursor-pointer select-none px-3 py-2.5 text-[13px] font-bold text-u2c-ink">
                Add more details (optional)
              </summary>
              <div className="flex flex-col gap-4 border-t border-u2c-line p-3">
                {optionalAttributeFields.map((field) => (
                  <AttributeFieldInput
                    key={field.name}
                    field={field}
                    value={attributeValues[field.name]}
                    onChange={(value) => setAttributeValues((prev) => ({ ...prev, [field.name]: value }))}
                  />
                ))}
              </div>
            </details>
          ) : null}

          <div className="flex flex-col gap-2">
            <span className={fieldLabelClass}>
              Photos <span className={fieldHintClass}>({selectedCategory.minPhotos} to {selectedCategory.maxPhotos})</span>
            </span>

            {photos.length < selectedCategory.maxPhotos ? (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--u2c-radius-card)] border-2 border-dashed border-u2c-line bg-u2c-tile px-6 py-10 text-center transition-colors duration-150 hover:border-u2c-primary">
                <Upload size={24} strokeWidth={1.75} className="text-u2c-ink-soft" aria-hidden />
                <span className="text-[15px] font-semibold text-u2c-ink">Tap to upload photos</span>
                <span className="text-[13px] text-u2c-ink-soft">One photo is enough to get started.</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => e.target.files && handlePhotoSelect(e.target.files)}
                  className="sr-only"
                />
              </label>
            ) : null}

            {photos.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-3">
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className="relative flex w-28 flex-col gap-1 rounded-[var(--u2c-radius-card)] border border-u2c-line bg-u2c-surface p-1.5"
                  >
                    <div className="relative h-24 w-full overflow-hidden rounded-[var(--u2c-radius-control)] bg-u2c-tile">
                      <Image src={photo.previewUrl} alt="" fill unoptimized className="object-cover" />
                    </div>
                    {photo.uploading ? (
                      <span className="text-[12px] text-u2c-ink-soft">Uploading…</span>
                    ) : photo.error ? (
                      <span className="text-[12px] text-u2c-error">{photo.error}</span>
                    ) : hasFlaws ? (
                      <label className="flex items-center gap-1 text-[12px] text-u2c-ink">
                        <input
                          type="checkbox"
                          checked={flawPhotoIndexes.includes(index)}
                          onChange={() => toggleFlawPhoto(index)}
                        />
                        Shows the flaw
                      </label>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      aria-label="Remove photo"
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-u2c-ink text-white"
                    >
                      <X size={12} strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {submitError ? (
            <p className="text-[14px] text-u2c-error" role="alert">
              {submitError}
            </p>
          ) : null}

          <div className="mt-2 flex gap-3">
            {!isPublishedEdit ? (
              <button
                type="submit"
                value="draft"
                disabled={submitting !== null}
                className="h-11 rounded-[var(--u2c-radius-control)] border-[1.5px] border-u2c-ink px-6 text-[13px] font-bold uppercase tracking-[0.03em] text-u2c-ink transition-colors duration-150 hover:bg-u2c-ink hover:text-white disabled:opacity-60"
              >
                {submitting === "draft" ? "Saving…" : "Save as draft"}
              </button>
            ) : null}
            <button
              type="submit"
              value="publish"
              disabled={submitting !== null}
              className="h-11 rounded-[var(--u2c-radius-control)] bg-u2c-primary px-6 text-[13px] font-bold uppercase tracking-[0.03em] text-white transition-colors duration-150 hover:bg-u2c-primary-press disabled:opacity-60"
            >
              {submitting === "publish"
                ? isPublishedEdit
                  ? "Saving…"
                  : "Publishing…"
                : isPublishedEdit
                  ? "Save changes"
                  : "Publish listing"}
            </button>
          </div>
        </>
      ) : null}
    </form>
  );
}
