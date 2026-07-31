"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createListing, updateListing } from "@/lib/actions/listings";
import { getAttributeFieldDescriptors, type FieldDescriptor } from "@/lib/categories/form-fields";
import type { CategorySlug } from "@/lib/categories/registry";
import type { ConditionValue } from "@/lib/categories/shared";
import { categoryRegistry } from "@/lib/categories/registry";
import { uploadListingPhoto } from "@/lib/storage/upload-listing-photo";
import { track } from "@/lib/analytics/track-client";
import { nairaToKobo, formatKobo } from "@/lib/money";
import { Button } from "@/components/ui/button";

export type SellableCategory = {
  slug: CategorySlug;
  displayName: string;
  browsable: boolean;
  minPhotos: number;
  maxPhotos: number;
  allowedConditions: readonly ConditionValue[];
  usageIndicatorFields: readonly string[];
};

export type ExistingListing = {
  id: string;
  status: string;
  categorySlug: CategorySlug;
  title: string;
  description: string;
  priceKobo: number;
  condition: string;
  conditionNotes: string | null;
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

function AttributeFieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = `${humanizeFieldName(field.name)}${field.required ? " *" : ""}`;
  const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

  switch (field.kind) {
    case "enum":
      return (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{label}</span>
          <select
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={inputClass}
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
          <legend className="text-sm font-medium">{label}</legend>
          <div className="flex flex-wrap gap-3">
            {field.options.map((option) => (
              <label key={option} className="flex items-center gap-1.5 text-sm">
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
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {label}
        </label>
      );
    case "number":
      return (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{label}</span>
          <input
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            className={inputClass}
          />
        </label>
      );
    case "date":
      return (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{label}</span>
          <input
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={inputClass}
          />
        </label>
      );
    case "string-array": {
      const items = Array.isArray(value) ? (value as string[]) : [];
      return (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{label}</span>
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
            className={inputClass}
          />
        </label>
      );
    }
    case "object": {
      const nested = (value as Record<string, unknown>) ?? {};
      return (
        <fieldset className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <legend className="text-sm font-medium">{humanizeFieldName(field.name)}</legend>
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
          <span className="text-sm font-medium">{label}</span>
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={inputClass}
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
        attributeValues,
      };
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [isEditing, categorySlug, condition, title, description, priceNaira, conditionNotes, attributeValues]);

  const selectedCategory = categories.find((c) => c.slug === categorySlug);

  function handleCategoryChange(slug: string) {
    const nextSlug = slug as CategorySlug;
    setCategorySlug(nextSlug);
    setCondition("");
    setAttributeValues({});
    setPhotos([]);
    setFlawPhotoIndexes([]);
    setDraftStartedAt(Date.now());

    const category = categories.find((c) => c.slug === nextSlug);
    if (category) {
      // §3.5 `listing_draft_started` — fires once the form is meaningfully
      // opened for a category (category_id is a required property).
      track("listing_draft_started", { category_id: category.slug, is_first_listing: isFirstListing });
    }
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

    if (isEditing && existingListing) {
      const result = await updateListing({
        listingId: existingListing.id,
        title,
        description,
        conditionNotes: conditionNotes || undefined,
        attributes: attributeValues,
        photoUrls,
        flawPhotoIndexes,
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
      conditionNotes: conditionNotes || undefined,
      attributes: attributeValues,
      photoUrls,
      flawPhotoIndexes,
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
    setPhotos([]);
    setFlawPhotoIndexes([]);
    setAttributeValues(preservedBrand !== undefined ? { brand: preservedBrand } : {});
    setCategorySlug(preservedCategory);
    setCondition(preservedCondition);
    setDraftStartedAt(Date.now());
    setSubmitError(null);
  }

  if (publishedListingId) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <p className="font-medium">Listing published.</p>
          <p className="mt-1">It&apos;s live now and can be found through search and by direct link.</p>
        </div>
        {/* §10 Epic B2 AC2: "List another" is the primary action. */}
        <Button type="button" onClick={handleListAnother} className="self-start">
          List another item
        </Button>
        <a href="/dashboard/listings" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Continue to dashboard
        </a>
      </div>
    );
  }

  const attributeFields = selectedCategory ? getAttributeFieldDescriptors(categoryRegistry[selectedCategory.slug].schema) : [];
  const visibleAttributeFields = attributeFields.filter(
    (field) => condition === "used" || !selectedCategory?.usageIndicatorFields.includes(field.name)
  );

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
      {restoredFromLocalDraft ? (
        <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          Restored your unsaved draft from this browser.
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Category</span>
        <select
          value={categorySlug}
          onChange={(e) => handleCategoryChange(e.target.value)}
          required
          disabled={isPublishedEdit}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
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
          <span className="text-xs text-zinc-500">Locked once published. Remove and relist to change it.</span>
        ) : null}
      </label>

      {selectedCategory && !selectedCategory.browsable ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {FOUNDING_SELLER_NOTICE}
        </p>
      ) : null}

      {selectedCategory ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={5}
              maxLength={90}
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={20}
              maxLength={1500}
              rows={4}
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Price (₦)</span>
            <input
              type="number"
              value={priceNaira}
              onChange={(e) => setPriceNaira(e.target.value)}
              min={500}
              max={5000000}
              required
              disabled={isPublishedEdit}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
            />
            {isPublishedEdit ? (
              <span className="text-xs text-zinc-500">
                Locked at {formatKobo(existingListing.priceKobo)} once published. Remove and relist to change it.
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Condition</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              required
              disabled={isPublishedEdit}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
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
              <span className="text-xs text-zinc-500">Locked once published. Remove and relist to change it.</span>
            ) : null}
          </label>

          {condition === "used" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Condition notes *</span>
              <textarea
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                minLength={20}
                maxLength={1000}
                rows={3}
                required
                placeholder="Describe the extent of use — this is what buyers rely on with no chat channel."
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          ) : null}

          {visibleAttributeFields.map((field) => (
            <AttributeFieldInput
              key={field.name}
              field={field}
              value={attributeValues[field.name]}
              onChange={(value) => setAttributeValues((prev) => ({ ...prev, [field.name]: value }))}
            />
          ))}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Photos ({selectedCategory.minPhotos} to {selectedCategory.maxPhotos})
              {condition === "used" ? " — tag at least one as wear evidence" : ""}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => e.target.files && handlePhotoSelect(e.target.files)}
              disabled={photos.length >= selectedCategory.maxPhotos}
            />
            <div className="mt-2 flex flex-wrap gap-3">
              {photos.map((photo, index) => (
                <div key={photo.id} className="flex w-28 flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob/object URL or already-hosted photo preview */}
                  <img src={photo.previewUrl} alt="" className="h-28 w-28 rounded-md object-cover" />
                  {photo.uploading ? (
                    <span className="text-xs text-zinc-500">Uploading…</span>
                  ) : photo.error ? (
                    <span className="text-xs text-red-600">{photo.error}</span>
                  ) : condition === "used" ? (
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={flawPhotoIndexes.includes(index)}
                        onChange={() => toggleFlawPhoto(index)}
                      />
                      Wear evidence
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="text-xs text-zinc-500 underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {submitError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {submitError}
            </p>
          ) : null}

          <div className="mt-2 flex gap-3">
            {!isPublishedEdit ? (
              <Button type="submit" value="draft" variant="outline" disabled={submitting !== null}>
                {submitting === "draft" ? "Saving…" : "Save as draft"}
              </Button>
            ) : null}
            <Button type="submit" value="publish" disabled={submitting !== null}>
              {submitting === "publish"
                ? isPublishedEdit
                  ? "Saving…"
                  : "Publishing…"
                : isPublishedEdit
                  ? "Save changes"
                  : "Publish listing"}
            </Button>
          </div>
        </>
      ) : null}
    </form>
  );
}
