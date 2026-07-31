# Handoff

Running log of what each prompt completed. Append a new `## Prompt N` section
after every prompt — never rewrite or remove earlier sections.

---

## Prompt 1 — Project scaffold

**Completed:**
- Next.js 15/16 + TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`) + Tailwind + shadcn/ui scaffold, matching the stack in PRD §12.1.
- Folder structure matching PRD §12.2 (`lib/categories/`, `lib/supabase/`, `lib/paystack/`, `lib/analytics/`, `lib/validation/`, `lib/money.ts`).
- Three-client Supabase pattern stubbed out (`client.ts`, `server.ts`, `service.ts` with `server-only`).
- `supabase/config.toml` and empty `supabase/migrations/`.
- README documenting the migration/typegen workflow; `.env.local.example` with client-safe vs server-only vars separated.
- Git repository initialized (`main` branch); initial commit `chore: initial project scaffold`.

**Verified:**
- `tsc --noEmit` clean.

**Not verified / not applicable at this stage:**
- No database, no auth, no features yet — nothing else to verify.

**Next prompt should build:** Auth + `profiles`/`payout_accounts` schema (became Prompt 2).

---

## Prompt 2 — Auth, Supabase clients, `profiles` + `payout_accounts`

**Completed:**
- Migration `supabase/migrations/20260727202617_profiles.sql`: `profiles` + `payout_accounts` tables, RLS enabled with policies in the same file, `profiles_public` view for safe public reads, `handle_new_user()` trigger (`SECURITY DEFINER`) that auto-creates a `profiles` row on `auth.users` insert with a generated unique `handle`.
- Three Supabase client patterns wired to the real `Database` type: `src/lib/supabase/client.ts` (browser), `server.ts` (cookie-based, SSR), `service.ts` (service-role, `server-only`, never imported client-side).
- Email + password auth (PRD §5.1/Epic A, not OTP/OAuth — see decision below): `(auth)/sign-up`, `(auth)/sign-in`, `auth/confirm/route.ts` (token-hash exchange, not Supabase's default hosted redirect). Confirmation email routed through Resend's SMTP relay via `config.toml`.
- `src/middleware.ts`: refreshes the session, redirects unauthenticated requests on `/sell`, `/dashboard`, `/orders`, `/admin` to `/sign-in?redirectTo=...`.
- `(seller)/dashboard/profile`: profile edit page (display_name, bio, phone, state, avatar URL) via `updateProfileAction`.
- `src/lib/result.ts`: shared `Result<T>` convention (PRD §11.3) for all future server actions.
- Dependency fix: `@supabase/ssr` bumped `0.6.1` → `^0.12.3` (the pinned version was type-incompatible with the resolved `@supabase/supabase-js@2.110.9`, silently collapsing all table types to `never`).

**Verified:**
- `npm run typecheck`, `npm run lint`, `npm run build` all pass clean.
- Service-role key/client confirmed absent from every file in `.next/static` after a production build (grepped directly).

**Not verified (Docker unavailable in this environment — not installed, not just stopped):**
- `supabase db reset` applying the migration cleanly.
- Signup actually creating a matching `auth.users` + `profiles` row.
- Cross-account RLS test (`phone`, `payout_accounts` inaccessible to a second user).
- `database.types.ts` is hand-authored to mirror the migration, not CLI-generated — must be regenerated and diffed against the hand-written version once Docker is available.

**Next prompt should build:** category registry + the five per-category Zod attribute schemas (`lib/categories/`), which every listing feature depends on.

See `docs/KNOWN_ISSUES.md` for open items and `docs/DECISIONS.md` for the reasoning behind deviations made this prompt.

---

## Prompt 3 — Category registry + per-category Zod attribute schemas

**Completed:**
- `src/lib/categories/shared.ts`: `ALL_CONDITIONS` (the shared three-value enum, PRD §6.3), `daysFromNow()`/`isPastDate()` date helpers reused by every schema.
- Five per-category schema files under `src/lib/categories/schemas/` (`beauty.ts`, `fashion.ts`, `gadgets.ts`, `personal-care.ts`, `home-goods.ts`), each: `.strict()` (unknown attribute keys rejected), exports `SCHEMA_VERSION = 1`, encodes every field/type/constraint from PRD §6.4's tables, and encodes every conditional-required business rule as a `.superRefine()`. Verified field-by-field against the PRD tables line by line — see `docs/DECISIONS.md` #9 for the design that makes this possible.
- `src/lib/categories/registry.ts`: maps each of the five slugs (`beauty`, `fashion`, `gadgets`, `personal_care`, `home_goods`) to `{ displayName, listable, browsable, minPhotos, maxPhotos, allowedConditions, schema, schemaVersion }`, sourced field-by-field from PRD §6.4. `personal_care`'s `allowedConditions` excludes `used` structurally (the type itself has no third value).
- `src/lib/categories/resolver.ts`: `resolveCategoryAttributes(categorySlug: string, rawAttributes: unknown): CategoryAttributesResult` — the single validation path; looks up the registry by slug (no `switch`), returns `{ ok: true, data }` or `{ ok: false, error: { code, message, issues } }` with one issue per failed Zod check.
- Added `vitest` (no test runner existed before this prompt) — `npm run test` runs it. 56 unit tests across 6 files (one per category + `resolver.test.ts`), each invalid fixture targeting one specific PRD rule.

**Verified:**
- `npm run test` — 56/56 pass.
- `npm run typecheck`, `npm run lint`, `npm run build` all pass clean with the new files in place.
- Confirmed by test: unknown attribute key rejected (`.strict()`); `personal_care` + `condition: "used"` fails at the type level, before any refinement runs; Gadgets object missing `functional_status` fails even with `condition: "brand_new"`.

**Not verified:**
- Nothing new — this prompt is pure domain logic (Zod + TypeScript), no I/O, no database, no Docker dependency. Everything statable here was actually run.

**Next prompt should build:** the `categories` and `listings` tables (migration). `listings.attribute_schema_version` must store each schema's current `SCHEMA_VERSION`; `categories.photo_min` and `categories.allowed_conditions` must match the registry, asserted at startup (PRD §6.5 HARD RULE) — divergence is a build failure. The listing-creation server action calls `resolveCategoryAttributes()` and must split the result: `condition` → `listings.condition`, everything else → `listings.attributes` (see `docs/DECISIONS.md` #9 for why `condition` lives inside the validated payload despite being a separate column).

See `docs/DECISIONS.md` for the design decisions behind the resolver signature and schema modeling choices made this prompt. No new items in `docs/KNOWN_ISSUES.md` this prompt.

---

## Prompt 4 — `categories` + `listings` tables, category seed

**Note on scope:** this prompt's own instructions initially asked for several columns/indexes that don't exist in PRD §7.1 (`min_photos`/`max_photos`/`attribute_schema_key` on `categories`; `view_count`/`sold_at` on `listings`; a 4-index list that reordered and dropped two of the PRD's six indexes). Verified against the full PRD text (grepped for every term — zero hits outside this prompt's own instructions) and flagged before writing any code; resolved in favor of PRD §7.1 exactly, per your decision. See `docs/DECISIONS.md` #15.

**Completed:**
- Migration `supabase/migrations/20260727215742_categories_listings.sql`: `categories` (id, slug, name, listable, browsable, photo_min, allowed_conditions, sort_order, created_at) and `listings` (all 17 PRD §7.1 columns, no more, no less), RLS enabled with policies in the same file, all 6 PRD-specified indexes verbatim (including the `(category_id, price_kobo) WHERE status = 'published'` partial index and the `(seller_id, seller_listing_index)` index the primary metric depends on).
- Three triggers on `listings`: `assign_seller_listing_index` (advisory-lock-serialised, non-racy, assigns at the moment a row becomes `published`, whether at INSERT or via a later `draft`→`published` UPDATE — see `docs/DECISIONS.md` #16), `prevent_published_listing_core_field_changes` (blocks changing `price_kobo`/`condition`/`category_id` once `status = 'published'`), `set_listings_updated_at`.
- DB-level CHECK constraints beyond what this prompt's item list explicitly asked for: `condition_notes` ≥ 20 chars AND `flaw_photo_indexes` non-empty when `condition = 'used'` — PRD §6.3's HARD RULE explicitly demands database-constraint enforcement for both in the same sentence, not just the first.
- `supabase/seed.sql`: the five categories with flags/values sourced from PRD §6.4 (photo_min: beauty 3, fashion 4, gadgets 5, personal_care 3, home_goods 4; only beauty `browsable = true`; `personal_care.allowed_conditions` excludes `used`). `sort_order` (1–5) isn't PRD-specified anywhere — used §6.4's own presentation order (6.4.1–6.4.5) as a reasonable default; admin-adjustable later per Epic E4.
- `src/lib/database.types.ts` hand-updated (still provisional, still no Docker) to add `categories` and `listings`.

**Verified:**
- Both new SQL files parse cleanly against a real PostgreSQL grammar (`libpg-query`, built from actual Postgres source) — 23 statements / 1 statement, zero syntax errors. This is a genuine syntax check, not just a read-through.
- Caught and fixed a real logic bug before that check even ran: `array_length()` returns `NULL` (not `0`) for an empty array, and `NULL` in a CHECK constraint is treated as passing — the original `flaw_photo_indexes` constraint would have silently let a `used` listing through with zero wear-evidence photos. Fixed with `coalesce(array_length(...), 0) >= 1`.
- `npm run typecheck`, `npm run lint`, `npm run test` (56/56, unchanged), `npm run build` all pass clean with the new migration/seed/types in place.
- Traced the trigger logic by hand against every status-transition case (fresh publish, draft→published, no-op update, published→removed) — see `docs/DECISIONS.md` #16.

**Not verified (Docker still unavailable — not installed in this environment):**
- `supabase db reset` actually applying migrations `0001` and `0002` and running the seed.
- The seed producing exactly 5 rows with the right flags, visible in Studio.
- The `condition_notes`/`flaw_photo_indexes` CHECK constraints actually rejecting a bad insert at the database level.
- All 6 indexes actually existing after a real `db reset`.
- `database.types.ts` is still hand-authored, now covering 4 tables + 1 view instead of 2 — the gap between it and CLI-generated output grows every prompt this continues.

**Next prompt should build:** `orders`, `order_events`(?), `ratings`, `payouts`, `moderation_flags` tables, per your stated plan.

See `docs/DECISIONS.md` for the reasoning behind every deviation and design choice this prompt. See `docs/KNOWN_ISSUES.md` for the startup-assertion gap (registry vs. `categories` table) this prompt's migration comments reference but doesn't build.

---

## Prompt 5 — `orders`, `disputes`, `ratings`, `payouts`, `moderation_flags`, `webhook_events`

**Note on scope:** this prompt's own instructions asked for an `order_events` table (zero references anywhere in the PRD — grepped) in place of `disputes` (a real PRD §7.1 table, required by Epic D5/E2), plus several schema mismatches on `payouts` (invented `processing` status, `order_ids` plural instead of PRD's singular `order_id` UNIQUE) and `webhook_events` (a single `paystack_event_id` column instead of PRD's `provider` + `event_id` composite UNIQUE). All four flagged before writing code; resolved in favor of PRD §7.1 exactly, per your decisions. A fifth issue surfaced *while implementing* the resolved `disputes` table: §7.1's own `reason` enum contradicts §10 Epic D5 AC2/§8.4's HARD RULE (missing `shipping_cost_dispute`, using `condition_mismatch` instead of `not_as_described`) — flagged separately, resolved in favor of §10/§8.4 (the HARD RULE + explicit failing-condition language outweighs the stale table). See `docs/DECISIONS.md` #21–#23.

**Completed:**
- Migration `supabase/migrations/20260728100239_orders_and_related.sql`: `orders`, `disputes` (not `order_events`), `ratings`, `payouts`, `moderation_flags`, `webhook_events` — all per PRD §7.1 exactly, RLS in the same migration.
- `orders`: full §8.1 state machine (9 statuses), no `delivery_fee` column (§8.4 HARD RULE), plus defense-in-depth CHECKs grounded directly in PRD formulas: `commission_kobo = floor(amount_kobo * 0.10)` (§8.3), `seller_payout_kobo = amount_kobo - commission_kobo` (§8.3), `buyer_id <> seller_id` (Epic D1 AC10).
- `disputes.reason` uses the 7-value enum from §10/§8.4 (includes `shipping_cost_dispute`), not §7.1's stale 6-value one.
- `ratings`: `order_id UNIQUE` is the only duplicate-rating guard (no read-then-write check anywhere). Base table has **no** SELECT policy — public reads go through a new `ratings_public` view (`review` nulled when `is_hidden`, `score` always visible), same reasoning as `profiles_public` (Prompt 2) — a single row-level RLS policy can't simultaneously hide a hidden review's text and keep that row's score visible.
- `payouts`: one row per order (`order_id UNIQUE`), 3-state status (`queued`/`paid`/`failed`), `admin_reference` column — per PRD, not the task's `processing`/`order_ids`/`bank_reference` version.
- `moderation_flags`: added `pattern_type`/`matched_text` columns alongside `reason`, grounded in §9.3's "carrying the matched pattern type and the matched text" language (no enum on `pattern_type` — the detector's token taxonomy is an explicit open item, §14). `webhook_events`: `provider` + `event_id` with composite `UNIQUE (provider, event_id)`, per PRD.
- `moderation_flags` and `webhook_events` have RLS enabled with **zero** policies — correct implementation of "Admin only" / "Service role only": Postgres denies all access by default when RLS is on and no policy matches.
- `src/lib/database.types.ts` hand-updated (still provisional, still no Docker) to add all 6 tables + `ratings_public`.

**Verified:**
- New SQL parses cleanly against a real PostgreSQL grammar (`libpg-query`) — 28 statements, zero syntax errors.
- `npm run typecheck`, `npm run lint`, `npm run test` (56/56, unchanged), `npm run build` all pass clean.
- Traced the `disputes`/`ratings` RLS subqueries against `orders`' own RLS by hand to confirm no unexpected interaction (both apply the same buyer-or-seller condition; redundant, not contradictory).

**Not verified (Docker still unavailable):**
- `supabase db reset` applying all three migrations and the seed together.
- The `orders`/`disputes`/`ratings`/`payouts` CHECK constraints (status enums, score range, commission formula, buyer≠seller) actually rejecting bad inserts at the database level.
- The `ratings_public` view actually nulling `review` for hidden rows while keeping `score` visible, against a live query.
- `database.types.ts` now covers 10 tables + 2 views, all still hand-authored — see `docs/KNOWN_ISSUES.md` #10, which keeps growing.

**Next prompt should build:** the trigger set that maintains denormalised counters (`profiles.completed_sales_count`, `rating_average`, `rating_count`, `dispute_upheld_count`) and connects rating/dispute/order-release events to those triggers, per your stated plan. Note: `profiles.rating_average`/`rating_count` triggers will read from `ratings`, not `ratings_public` — the view is a read-side projection only.

See `docs/DECISIONS.md` for every deviation and design choice this prompt. See `docs/KNOWN_ISSUES.md` for what's still open, including the admin-role-check gap (#12) that now also covers `orders`/`disputes`/`payouts`/`moderation_flags`/`webhook_events`.

---

## Prompt 6 — Denormalised counter triggers

**Note on scope:** two issues flagged before writing code, both resolved as recommended. (1) The task asserted the `listing_published` event property is named `seller_listing_ordinal`, deliberately different from the `listings.seller_listing_index` column — grepped the whole PRD for "ordinal," zero hits; §3.5 uses `seller_listing_index` for both the column and the event property. No dual-naming scheme exists; naming stays unified. (2) The task asked for a trigger assigning `seller_listing_index` at publish time — this already exists, built in Prompt 4 (`assign_seller_listing_index`, advisory-lock-serialised). Skipped rebuilding it; this migration covers only the 3 counters that didn't exist yet. See `docs/DECISIONS.md` #26–#27.

**Completed:**
- Migration `supabase/migrations/20260728102304_triggers.sql`, three triggers:
  - `increment_completed_sales_count` — `AFTER UPDATE ON orders WHEN (new.status = 'released' AND old.status IS DISTINCT FROM 'released')`. Plain `+1` (not a recompute) — PRD doesn't warn of drift risk for this counter the way it does for ratings, and a simple `col = col + 1` UPDATE is race-safe under Postgres row locking without needing an advisory lock.
  - `recompute_seller_rating` — `AFTER INSERT ON ratings`. Full recompute of `rating_count`/`rating_average` over all of that seller's ratings (not incremental), matching the task's explicit "recompute is acceptable" guidance. `rating_average` stays `NULL` below 3 ratings (§9.2 HARD RULE). Every rating counts regardless of `is_hidden` — only the review text is hidden, never the score (§7.1).
  - `increment_dispute_upheld_count` — `AFTER UPDATE ON disputes WHEN (new.status = 'resolved_buyer' AND old.status IS DISTINCT FROM 'resolved_buyer')`. `resolved_buyer` is the path where the dispute is upheld against the seller (§8.1: `resolved_seller` → `released`, no fault; `resolved_buyer` → `refunded`, seller at fault). `disputes` has no `seller_id` column of its own — looked up via `order_id`.
- **A real bug caught and fixed before it shipped:** `recompute_seller_rating` needs `SECURITY DEFINER` (with `search_path` pinned, matching Prompt 2's `handle_new_user` precedent) — the other two triggers don't. Ratings are inserted by the buyer's own authenticated session (Prompt 5's RLS lets the buyer insert directly, no service-role hop), but the trigger must update the *seller's* profile row. Without `SECURITY DEFINER`, `profiles_update_own`'s `auth.uid() = id` check would silently block the update — 0 rows affected, no error, since the buyer isn't the seller. `orders`/`disputes` have no `UPDATE` policy for `authenticated` at all (Prompt 5), so those two triggers can only ever fire under a service-role transition, which already bypasses RLS for the whole transaction — no `SECURITY DEFINER` needed there.
- `database.types.ts` — no change. This migration adds no tables/columns/views, only functions and triggers on existing schema.

**Verified:**
- New SQL parses cleanly against a real PostgreSQL grammar (`libpg-query`) — 6 statements, zero syntax errors.
- `npm run typecheck`, `npm run lint`, `npm run test` (56/56, unchanged), `npm run build` all pass clean.
- Traced the RLS-bypass reasoning above by hand against Prompt 5's actual policy set (re-read, not assumed) to confirm which triggers need `SECURITY DEFINER` and which don't.

**Not verified (Docker still unavailable):**
- Any of the three triggers actually firing against a live database — the verification steps in this prompt (transition a test order to `released` and check the increment; insert 2 then 3 ratings and check the average appears at exactly 3) all require a running Postgres instance.
- Whether `recompute_seller_rating`'s `SECURITY DEFINER` reasoning holds up in practice — it's correct by RLS-policy inspection, but "correct by inspection" and "verified by execution" are not the same thing, and this file has four migrations deep of the former with zero of the latter.

**Next prompt should build:** the seller listing-creation flow — reads the category registry (Prompt 3), writes to `listings` (Prompt 4), and depends on `profiles.completed_sales_count` (this prompt) for the §5.4 tier/cap gate at publish time.

See `docs/DECISIONS.md` #26–#29 for this prompt's reasoning. `docs/KNOWN_ISSUES.md` gets two new items (#16, #17) — the untested `SECURITY DEFINER` boundary and the unrun migration itself; the broader Docker-verification gap (#1/#2/#8/#13) now also covers this migration.

---

## Prompt 7 — Seller listing creation flow (`/sell`, `createListing`)

**Note on citations/naming:** two minor corrections applied, neither blocking. (1) The founding-seller notice is PRD §6.2, not §4 (§4 is "Users and roles"; Epic B1 AC2 itself cites "the opening soon notice from 6.2"). (2) The task described an event `listing_started` with `is_first_listing` on `listing_published`, and `seller_listing_ordinal`. Per §3.5's actual table and Prompt 6's already-settled resolution, the event is `listing_draft_started` (carrying `is_first_listing`), `listing_published` carries `seller_listing_index`, and there is no "ordinal" anywhere in the PRD — `src/lib/analytics/events.ts`'s existing `EventName` type already had the correct names. Used those.

**Completed:**
- Migration `supabase/migrations/20260728134156_listing_photos_storage.sql`: `listing-photos` Storage bucket (public read, 5MB/image-mime-type limits), RLS on `storage.objects` scoping insert/update/delete to the uploader's own `{seller_id}/...` folder.
- `src/lib/listings/schema.ts`: `buildListingSubmissionSchema(category)` — the listing-level fields (title/description/price/photos/condition_notes) that live outside category `attributes` JSONB, dynamically bounded by that category's `minPhotos`/`maxPhotos`. Closes the gap flagged in `docs/KNOWN_ISSUES.md` #11 (Prompt 5) — this is the schema that composes with `resolveCategoryAttributes` (Prompt 3).
- `src/lib/listings/limits.ts`: `computeListingLimit()` — pure function implementing §5.4's tier/cap table, `listing_limit_override` superseding entirely. `listingLimitMessage()` names the cap, tier, and what lifts it (§5.4 HARD RULE — never a generic error).
- `src/lib/moderation/contact-detector.ts`: `scanForContactDetails()` stub, always reports "not detected." Single, clearly-TODO'd call site in `createListing` for prompt 9 to wire the real detector into.
- `src/lib/analytics/events.ts`: added `EventProperties` (typed per-event shapes from §3.5's table) and a `track()` stub that logs — the file's own pre-existing TODO, now resolved for this prompt's call sites.
- `src/lib/actions/listings.ts`: `createListing(input: CreateListingInput): Promise<Result<{ listingId: string }>>` — see signature below. Validates listing-level fields and category attributes (both authoritative), enforces the §5.4 limit gate before insert, writes `attribute_schema_version` from the registry, publishes instantly (`status: 'published'`), never sets `seller_listing_index`/`published_at` (trigger-owned, Prompt 4).
- `src/lib/categories/form-fields.ts`: `getAttributeFieldDescriptors()` introspects a category's Zod schema (`ZodEffects.innerType()` → `ZodObject.shape`, recursively unwrapping `Optional`/`Default`/`Nullable`) into a generic field-descriptor list — the mechanism that makes AC3 ("no hardcoded per-category form fields") possible.
- `usageIndicatorFields` added to the registry and all 5 category schema files, sourced from §6.3's table exactly (with two documented exclusions — Gadgets' `battery_health_percent`/`functional_status` and Home Goods' `functional_status` — since those are gated by product_type/`is_powered`, not `condition`, so hiding them until `used` would be wrong). This is registry data, not per-category UI logic, and is what lets the form reveal usage-indicator fields on `used` without hardcoding.
- `src/lib/storage/upload-listing-photo.ts`: client-side upload to the new bucket + `getPublicUrl`, per PRD §15.5 B20 (client-side only, no processing pipeline).
- `src/app/(seller)/sell/page.tsx` + `listing-form.tsx`: category select (DB `sort_order`/`listable`/`browsable` — admin-controlled — joined with registry `minPhotos`/`maxPhotos`/`allowedConditions`/`schema` — code-authoritative, per §6.5), founding-seller notice on non-browsable categories, condition select scoped to the category's `allowedConditions`, dynamic attribute fields via the descriptor helper, multi-photo upload with per-file progress, wear-evidence photo tagging when `used`.
- Unit tests: `src/lib/listings/__tests__/{schema,limits}.test.ts` (14 new tests) — the task didn't explicitly require tests this time, but both modules are pure and cheap to verify given the existing vitest setup, so I added them rather than relying only on manual reasoning.

**Verified:**
- `npm run typecheck`, `npm run lint` (one harmless warning on the intentionally-unused stub parameter in `contact-detector.ts`), `npm run test` (70/70 — 56 unchanged + 14 new), `npm run build` all pass clean. `/sell` registered as a route.
- New Storage migration parses cleanly against a real PostgreSQL grammar (`libpg-query`) — 5 statements, zero errors.
- Traced every VERIFICATION scenario from the task by hand against the actual code: Personal Care `used` and Gadgets missing `functional_status` are already covered by Prompt 3's existing resolver tests (unchanged, still passing) — the category-rule enforcement this prompt depends on was never touched, only newly exercised through a real call site.

**Not verified (Docker still unavailable):**
- The Storage migration applying, the bucket/policies actually working, or the full flow running end-to-end against a live Supabase instance — everything above is verified by typecheck/lint/unit-test/manual trace, not by executing a real publish.

**Known gaps, flagged rather than silently accepted:**
- The §5.4 limit-gate check (count active listings, compare to cap, then insert) has a TOCTOU race: two near-simultaneous publish requests from the same seller sitting exactly at her cap could both read the same count and both pass. Unlike the counters fixed in the last review pass, this isn't wrapped in an advisory lock. See `docs/KNOWN_ISSUES.md`.
- The dynamic form only conditionally reveals the registry-derived `usageIndicatorFields` on `used`; other conditionally-required fields (e.g. Gadgets' `imei_last_6` for phones/tablets, `storage_gb` by product_type) always render once a category is picked, since deriving arbitrary product-type-gating generically from Zod shapes isn't feasible without inspecting `superRefine` internals. Server-side enforcement (Prompt 3's resolver) is complete regardless — this is a UX guidance gap, not a validation gap.

**Next prompt should build:** listing refinement — edit rules (immutable `price_kobo`/`condition`/`category_id` once published), draft autosave to `localStorage`, and the "list another" flow (Epic B2 — the PRD's stated growth mechanism).

`createListing` signature:
```ts
function createListing(input: CreateListingInput): Promise<Result<{ listingId: string }>>

type CreateListingInput = {
  categorySlug: string;
  title: string;
  description: string;
  priceKobo: number;
  condition: string;
  conditionNotes?: string;
  attributes: Record<string, unknown>; // category-specific fields only, condition is separate
  photoUrls: string[];
  flawPhotoIndexes?: number[];
  draftStartedAt: number; // epoch ms, for time_to_publish_seconds
};
```

See `docs/DECISIONS.md` #30–#34 for this prompt's design choices.

---

## Prompt 8 — Listing management and the "list another" growth flow

**Note on conflict resolution:** one material conflict, resolved via AskUserQuestion (quoting both HARD RULEs), before writing code. §5.4 requires draft creation to be real and never capped ("AC0 fails if the limit blocks draft creation rather than publish"); §6.1 requires every JSONB write to be fully Zod-validated, no exceptions. The task's draft-save instruction didn't say whether a draft needs the same validation strictness as a publish. Asked; answer was "drafts require full validation too" — see `docs/DECISIONS.md` #35. One low-stakes citation-style correction, not blocking: the task's "pre-fills brand" undersold PRD Epic B2 AC3, which also prefills `condition`; followed the AC's literal text (`docs/DECISIONS.md` #36).

**Completed:**
- `src/lib/listings/validate-submission.ts`: `validateListingSubmission()` — the single shared entry point for full listing validation (listing-level schema + category attribute resolver), used identically by both `createListing` and `updateListing` regardless of draft/publish. No code path persists a partially-valid row.
- `src/lib/listings/check-limit-gate.ts`: `checkListingLimitGate()` — the §5.4 cap check, extracted from `createListing`'s inline logic (Prompt 7) so `updateListing`'s draft→publish transition goes through the exact same gate.
- `src/lib/listings/has-blocking-order.ts`: `hasBlockingOrder()` — Epic B4 AC5 ("a listing with an order in any status other than `cancelled` or `expired` cannot be removed or edited"), shared by `updateListing` and `removeListing`.
- `src/lib/actions/listings.ts`: `createListing` refactored onto the three shared helpers above and given `saveAsDraft` support (`status: 'draft'`, cap check skipped). Two new actions:
  - `updateListing(input: UpdateListingInput): Promise<Result<void>>` — rejects the update outright (`immutable_field`) if `priceKobo`, `condition`, or `categorySlug` is present at all on a `published` listing, regardless of whether the value actually changed. Every other field falls back to the listing's current value and is re-validated in full through `validateListingSubmission`. `publish: true` on a `draft` row runs the limit gate and flips `status` to `published`, firing `listing_published` with `time_to_publish_seconds` measured from `created_at` (no client-supplied `draftStartedAt` survives a resumed-later draft).
  - `removeListing(listingId): Promise<Result<void>>` — sets `status = 'removed'`; blocked by `hasBlockingOrder`. Does not itself restrict which prior status is eligible (see `docs/DECISIONS.md` #38) — that restriction lives in the dashboard UI.
- `src/app/(seller)/sell/page.tsx`: now handles three entry states — fresh create (AC6: defaults the category select to the seller's most recently used category, via a plain query, no embedded-select), resume a draft via `?listing=<id>`, and edit a published listing via the same param.
- `src/app/(seller)/sell/listing-form.tsx`: `ExistingListing` type + `existingListing`/`defaultCategorySlug` props. Read-only price/condition/category inputs with "remove and relist" copy once `existingListing.status === 'published'`. Dual submit intent ("Save as draft" vs "Publish") via two `<button type="submit" value="…">` elements, read from `(e.nativeEvent as SubmitEvent).submitter` — preserves native HTML5 validation for both paths, since drafts need the same strictness as publish (#35). localStorage autosave (`urs2cash:sell-draft`, 500ms debounced, excludes photos since `File` isn't serializable), restored post-mount only when not editing/resuming a server-persisted listing. "List another": resets everything except `categorySlug`/`condition`/`attributeValues.brand`, fires `list_another_clicked` with `from_listing_id`.
- `src/app/(seller)/dashboard/listings/page.tsx` + `remove-listing-button.tsx`: seller's own listings grouped into Drafts/Published/Sold/Removed sections (status values fixed by the migration's CHECK constraint), each with Resume/Edit + Remove actions (draft/published only — see `docs/DECISIONS.md` #38). View count omitted — no such column exists (`docs/KNOWN_ISSUES.md` #22).
- Satisfied Next 16's React Compiler lint rules (`react-hooks` v6, bundled in `eslint-config-next`) without weakening the hydration-safety design: lazy `useState` initializers instead of calling `Date.now()` directly during render, a scoped `eslint-disable`/`eslint-enable` around the one-time localStorage-restore effect's `setState` calls (justified inline — see `docs/DECISIONS.md` #39), and `useRouter().push()` instead of `window.location.href` after a draft save.

**Verified:**
- `npx tsc --noEmit`, `npx eslint "src/**/*.{ts,tsx}"`, `npx vitest run` (70/70, unchanged from Prompt 7 — this prompt added no new pure-function modules worth unit-testing beyond what schema/limits already cover), and `npm run build` all pass clean. `/dashboard/listings` registered as a route.
- Manually traced every VERIFICATION scenario from the task: `updateListing` rejects a price change on a `published` listing (`immutable_field`, checked before any DB write) but accepts a description-only change (falls through to `validateListingSubmission` and updates); the localStorage-restore effect runs once post-mount, guarded off entirely while `existingListing` is set, so resuming a killed tab restores unsaved create-flow state without touching a real resume/edit session; `handleListAnother` carries `categorySlug`/`condition`/`brand` forward and clears everything else, matching AC3's literal text exactly.

**Not verified (Docker still unavailable):** no new migration this prompt — confirmed no schema change was needed (`listings.status` already allows `'draft'` since Prompt 4, all touched columns already exist) — so this prompt adds no new items to the "migration never run" family of gaps.

**Known gaps, flagged rather than silently accepted:**
- No `view_count` column exists anywhere in the schema; Epic B4 AC1 asks the dashboard to show it. Displayed status/category/price/age only. See `docs/KNOWN_ISSUES.md` #22.
- The §5.4 TOCTOU race (`docs/KNOWN_ISSUES.md` #19) now has a second call site (`updateListing`'s publish path) via the shared `checkListingLimitGate` helper — same open issue, doubled motivation to fix it once, centrally. See `docs/KNOWN_ISSUES.md` #23.
- `/dashboard/listings` has no inbound link from anywhere but the post-publish success screen — there's no global nav yet to add one to. See `docs/KNOWN_ISSUES.md` #24.

**Next prompt should build:** contact-detail detection as flag-not-block (§9.3), wired into the listing creation and rating submission paths — the `scanForContactDetails` stub in `src/lib/moderation/contact-detector.ts` has a single documented TODO call site in `createListing` waiting for this.

`updateListing`/`removeListing` signatures:
```ts
function updateListing(input: UpdateListingInput): Promise<Result<void>>
function removeListing(listingId: string): Promise<Result<void>>

type UpdateListingInput = {
  listingId: string;
  title?: string;
  description?: string;
  priceKobo?: number;      // rejected server-side if already published
  condition?: string;      // rejected server-side if already published
  categorySlug?: string;   // rejected server-side if already published
  conditionNotes?: string;
  attributes?: Record<string, unknown>;
  photoUrls?: string[];
  flawPhotoIndexes?: number[];
  publish?: boolean;       // attempt draft -> published; ignored if already published
};
```

See `docs/DECISIONS.md` #35–#39 for this prompt's design choices.

---

## Prompt 9 — Contact-detail detection (§9.3), wired into listing creation/edit

**Completed:**
- `src/lib/moderation/contact-detector.ts`: `scanForContactDetails(text)` replaces Prompt 7's always-false stub with real detection, in priority order (first match wins — one detection per scan, matching Epic B1 AC9b's "exactly one `moderation_flags` row"): phone → email → whatsapp → instagram → telegram → bare `@handle` → generic URL.
  - Phone detection handles every format §9.3 names by name: `+234`, `0`-prefixed local, bare (no leading 0, e.g. `803 123 4567`), spaced/dashed/dotted grouping, `O`/`o`/`I`/`i`/`L`/`l` letter-substitution for `0`/`1`, and fully spelled-out digits (`"zero eight zero three one two three four five six seven"`, requiring a run of ≥7 consecutive number-words to avoid firing on ordinary prose that mentions a couple of quantities).
  - A candidate digit/letter-substitution regex is deliberately broad (the recall layer, per §9.3's explicit recall-over-precision mandate); `isNigerianPhoneShape()` — exact 11-digit (`0`-prefixed), 13-digit (`234`-prefixed), or 10-digit (bare `7`/`8`/`9`-prefixed) — is the actual precision filter, applied after separators are stripped and substitute letters are normalized back to digits.
- `src/lib/moderation/flag-contact-detection.ts`: `flagContactDetection({ listingId, categorySlug, detection })` — the shared post-write step. Inserts a `moderation_flags` row (`source: 'auto_contact_detect'`, carrying `pattern_type`/`matched_text`) via the **service-role client**, then fires `contact_detail_flagged`. Never called from a path that can still fail the underlying write.
- `src/lib/actions/listings.ts`: both `createListing` and `updateListing` now scan `title`/`description`/`condition_notes` and call `flagContactDetection` after their respective inserts/updates succeed — never before, and never gating the result either way. Wired into both draft saves and publishes (a draft is still a submission of listing text), and into every edit, not just creation.
- Test battery: `src/lib/moderation/__tests__/contact-detector.test.ts` — 29 tests: every phone format/obfuscation named in §9.3 explicitly, each other channel type, and 8 clean-prose cases (ordinary descriptions, short prices, spec lists, scattered non-consecutive number words, dotted dates, percentages) that must not false-positive.

**Verified:**
- `npx tsc --noEmit`, `npx eslint "src/**/*.{ts,tsx}"` (the bare `npm run lint` invocation now also scans `.agents/skills/gstack/` — vendored, gitignored third-party tooling not part of this project's scaffold — and fails on ~900 pre-existing errors there unrelated to any prompt in this project; confirmed via `git stash` that this failure exists identically with none of this prompt's changes applied. Scoped to `src/**` as prior prompts already did), `npx vitest run` (99/99 — 70 unchanged + 29 new), `npm run build` all pass clean.
- **End-to-end, against the live local Postgres instance** (not just unit tests): scanned `"...Call 0803 123 4567 if you want it faster..."`, inserted the resulting listing via the service-role client, and confirmed all three PRD-mandated outcomes together — the listing's `status` was `published` (never blocked), exactly one `moderation_flags` row existed for that listing afterward (`source: auto_contact_detect`, `pattern_type: phone`, `matched_text: "0803 123 4567"`), and the `contact_detail_flagged` payload was correct. This is Epic B1 AC9b, verified by execution, not just by unit test.
- Confirmed by test: a phone number is still detected correctly even when immediately adjacent to ordinary English words containing `o`/`i`/`l` (e.g. `"...4567 if you want..."`, `"Call 0803..."`) — the initial implementation had a real bug here (see below) that the boundary-anchored regex fixes.

**A real bug caught during testing, not just at review:** the first version of the phone candidate regex had no token-boundary protection. Since `O`/`I`/`L` are simultaneously valid phone-obfuscation letters *and* ordinary English letters, an unanchored greedy match would absorb a stray letter from an adjacent word across a space — e.g. the `i` in `"...4567 if you..."` or the `ll` in `"Call 0803..."` — into the candidate. That stray letter then got letter-substituted into the digit string during normalization, corrupting the shape check and producing a false *negative* on real, valid phone numbers embedded in ordinary sentences. Fixed with `(?<![a-zA-Z0-9])`/`(?![a-zA-Z0-9])` boundary assertions forcing the match to snap to genuine token edges. Caught by the test battery, not by inspection — the first draft's tests failed on exactly the realistic cases (a phone number followed by "if", preceded by "Call") that prose actually produces.

**Known gap, flagged rather than silently accepted:**
- "Raised to the top of the moderation queue" (§9.3 point 3) needed no schema change — `moderation_flags` has no priority column, and none was added. Epic E1 AC1 (not yet built) already specifies the future admin queue lists flags "newest first," which is sufficient: a freshly created flag is the top of a newest-first list by construction. See `docs/DECISIONS.md` #40.

**Not wired (documented, not built — no action exists yet):**
- Rating `review` text scanning (§7.1 HARD RULE, Epic D6/prompt 18) has no call site yet because `src/lib/actions/ratings.ts` doesn't exist. A detailed TODO in `contact-detector.ts`'s module docstring specifies exactly what the future `submitRating` call site must do (scan `review`, flag via the service-role client on a hit, fire the event, never block) — mirroring the shape already proven out in `listings.ts`.

**Next prompt should build:** buyer-facing browse and search (per this prompt's own brief) — category grids gated by `browsable`, search ungated across all `listable` categories.

See `docs/DECISIONS.md` #40–#41 for this prompt's design choices.

---

## Prompt 10 — Buyer-facing discovery (Epic C1/C2): browse, search, the asymmetric `browsable` gate

**Note on citations:** two of this prompt's own section numbers didn't match the PRD (the "2.5"/"3.4" pattern recurring from Prompt 9). "Section 4 (asymmetric visibility)" is actually §6.2 (Visibility flags); "3.3/3.4 (performance/rendering)" is actually §5.3 (Offline behaviour's performance requirements) and §12.2 (file structure). Grepped the PRD's own section headers to confirm before building against the correct text — content matched what the task described regardless of the number.

**Completed:**
- `src/lib/discovery/queries.ts`: `getBrowsableCategories` (nav/grid, DB `browsable=true` ordered by `sort_order`), `getCategoryBySlug` (404 gate check), `getRecentlyListed` (explicitly no `browsable` check — cross-category by design), `getCategoryListings` (price/condition on real columns, category attributes via JSONB `@>` containment against the GIN index), `getAttributeFilterDescriptors` (registry-derived, scoped to `enum`/`boolean` field kinds only — see Decision #42 for why numeric attribute ranges are out of scope).
- `supabase/migrations/20260729070438_search_listings_function.sql`: `search_listings()` SQL function — a thin wrapper around §7.1's exact tsvector index expression (not a stored column PostgREST's `.textSearch()` could target directly), `stable`, not `security definer` (runs as the caller so RLS applies normally). No `browsable` reference anywhere.
- `src/lib/discovery/search.ts`: `searchListings()` calls the RPC, joins category names in a second batched query (Epic C2 AC3).
- `src/components/listing/listing-card.tsx`: shared card, `next/image` with `fill` inside an `aspect-square` wrapper (layout-shift-proof regardless of a user-uploaded photo's real aspect ratio), responsive `sizes`, lazy by default (nothing sets `priority`).
- `src/components/site-header.tsx`: Server Component nav (browsable categories only) + GET-method search form — this incidentally resolves Known Issue #24 (no global nav existed).
- `src/app/(marketing)/page.tsx` (moved out of the bare `src/app/page.tsx` scaffold): category grid (browsable only) + "Recently listed" (explicitly cross-category, ignores browsable).
- `src/app/(shop)/c/[slug]/page.tsx`: 404s via `notFound()` when the category doesn't exist or `browsable=false`; GET-form filters (price range, condition, registry-derived attribute selects) — filter state lives entirely in the URL query string, making every filtered view shareable without any client-side state.
- `src/app/(shop)/search/page.tsx`: reads `q`/`page` from the URL; empty-query and no-results states both offer a next action (Epic C2 AC4), never a dead end.
- `next.config.ts`: `images.remotePatterns` for Supabase Storage (local `127.0.0.1`, hosted `*.supabase.co`, plus whatever `NEXT_PUBLIC_SUPABASE_URL` resolves to) and `formats: ["image/avif", "image/webp"]` — required for `next/image` to serve any listing photo at all, since every one is Storage-hosted, an external host from Next's perspective.
- **`src/lib/database.types.ts` is now genuinely CLI-generated**, not hand-authored — Docker has been available since the session before this one, and this prompt needed `search_listings`'s real RPC type, which made this the natural moment to do the swap the file's own header had been promising since Prompt 2. Diffed against the prior hand-authored version: every table's Row/Insert/Update shape matched field-for-field except two things now correctly present — view-column nullability, and the fuller `Relationships` array (see Decision #43). Resolves Known Issue #1/#10.

**A real, if narrow, type-correctness improvement the swap surfaced:** the generated `listings` Insert type correctly marks `seller_listing_index` as required — the column has no DB-level `DEFAULT`, only the `assign_seller_listing_index` trigger fills it, and the hand-authored version had simply omitted the field from its Insert type entirely, silently letting `createListing`'s insert typecheck without it. Confirmed by reading the trigger body directly (`supabase/migrations/20260727215742_categories_listings.sql`): it unconditionally overwrites `seller_listing_index` on every insert — the real sequence number on a publish, its own `0` sentinel otherwise (Decision #16) — so `createListing` now explicitly sends `seller_listing_index: 0` with a comment explaining it's always discarded, rather than fighting the (now-correct) type.

**Verified:**
- `npx tsc --noEmit`, `npx eslint "src/**/*.{ts,tsx}"`, `npx vitest run` (99/99, unchanged), `npm run build` all pass clean.
- **Live, against the running dev server and the local database** (not just unit-level): seeded a Fashion listing (non-browsable) and a Beauty listing (browsable), both `published`. Confirmed: `/` and `/c/beauty` render `200`; `/c/fashion` and `/c/not-a-real-slug` both `404`; the nav and home-page grid list only "Beauty"; the home page's "Recently listed" section lists *both* the Beauty and the Fashion listing side by side; `/search?q=jacket` returns the Fashion listing labeled with its category name ("Fashion"); `/c/beauty`'s filter form renders the registry-derived `product_type`/`size_unit`/`pao_months` selects alongside price/condition. This is the prompt's central HARD RULE, verified by execution: a non-browsable category's listing is invisible on the grid/nav and fully findable by search.
- Confirmed by inspecting the rendered HTML directly: every `ListingCard` image sits inside a `position: relative` `aspect-square` div with `fill` — the box's dimensions never depend on the image loading, satisfying "no layout shift" structurally, not just by inspection of the component's intent.

**Known gap, flagged rather than silently accepted:**
- `/l/[id]` (listing detail) doesn't exist yet — every `ListingCard` links there, and every link currently 404s on click. This is explicitly the next prompt's own scope (Epic C3), not an oversight here; "a non-browsable category's listing is reachable by its direct URL" is therefore verified only up to "the listing is findable and the link is generated correctly" — the destination page itself is next prompt's job.
- Attribute filtering is scoped to `enum`/`boolean` registry fields only (exact-match JSONB containment, which the GIN index accelerates per AC5's literal requirement). Numeric attribute ranges (e.g. `battery_health_percent`) are out of scope — see Decision #42.
- `export const revalidate` was deliberately not added to these pages: `createClient()` (src/lib/supabase/server.ts) calls `cookies()` internally, which is a Next.js Dynamic API that forces per-request rendering regardless of any `revalidate` export. Adding one would be cosmetic, not real caching. Achieving genuine edge caching for these public-readable pages would need a separate, non-cookie-bound anon client — a real architecture change, not something to slip in as a side effect of this prompt. Flagged, not built.

**Next prompt should build:** listing detail (`/l/[id]`) — Epic C3, the primary purchase-decision surface (photos, all attributes rendered generically from the registry, condition definition text, seller reputation block, Open Graph tags load-bearing for pre-browsable categories per AC7).

See `docs/DECISIONS.md` #42–#43 for this prompt's design choices.

Committed as `6538385` and pushed to `origin/main`. `docs/PROJECT_STATUS.md` reflects the full state as of this prompt — read it first in a fresh session before starting Prompt 11.

---

## Prompt 11 — Listing detail (`/l/[id]`, Epic C3), scoped to C3 only (C4 deferred to Prompt 12)

**Completed:**
- Two new migrations, both discovered as real gaps while building this prompt, not asked for by the task:
  - `20260729080000_profiles_public_dispute_rate.sql`: adds `dispute_upheld_count` to `profiles_public` (Decision #44) — the reputation block's dispute rate needs the numerator, which the view didn't expose. Decision #1 (Prompt 2) had named this exact moment as the point to revisit it.
  - `20260729080500_listings_select_sold.sql`: widens the public `listings` SELECT policy from `status = 'published'` to `status in ('published', 'sold')` (Decision #45) — AC6 ("sold listings display as sold, not purchasable") requires a sold listing's detail page stay reachable, which the original policy would have 404'd.
  - `database.types.ts` regenerated against the live local Postgres instance to pick up both changes.
- `src/lib/categories/registry.ts` / `schemas/gadgets.ts`: new `adminOnlyAttributeFields` registry field (Decision #46), populated only for Gadgets' `imei_last_6`. `src/lib/discovery/get-listing.ts`'s `getListingDetail()` strips every category's declared admin-only fields from `attributes` at the data layer, before the object leaves the query — not just skipped at render time.
- `src/lib/categories/shared.ts`: `CONDITION_DEFINITIONS` — §6.3's condition table (label + full definition text) as a shared export, for AC4.
- `src/lib/categories/attribute-display.ts`: `buildAttributeDisplay(categorySlug, attributes)` — the generic, field-name-keyed rendering engine (Decision #47). Splits a category's attributes into `prominent` (functional_status/cosmetic_grade/fill_level_percent, plus a computed `remaining_pao` entry folding `pao_months`+`opened_at_date` into one value), `table` (everything else), and `measurements` (any object-kind field, e.g. Fashion's `measurements_cm`, as its own sub-table with the unit inherited from the parent field's name). Zero category-name switches anywhere in this file.
- `src/lib/discovery/get-listing.ts`: `getListingDetail(id)`, wrapped in React's `cache()` keyed on `id` alone so `generateMetadata` and the page share one DB round trip. No `browsable` check, deliberately (AC1). Returns `null` for any non-`published`/non-`sold` status, any nonexistent id, or an unrecognized category slug.
- `src/lib/reputation/get-seller-reputation.ts` + `src/components/reputation/seller-reputation-block.tsx`: the reusable reputation query/component (Decision #50), built explicitly for Epic C4 (next prompt) to reuse without duplication, per this prompt's own instruction. Implements AC5/AC5b exactly: zero-sales sellers render only "New seller" + join date (nothing else); otherwise completed sales / member-since / rating (gated at `rating_count >= 3`, else the literal text "New seller" in that slot) / dispute rate (gated at `completed_sales_count >= 5`) / up to 3 most recent non-hidden reviews with review text. No verification badge anywhere in the file.
- `src/lib/discovery/referrer-surface.ts`: `inferReferrerSurface()` — maps the inbound `Referer` header's path to a surface name (`home`/`category_page`/`search`/`seller_profile`/`listing_detail`/`other`/`direct`), avoiding threading a `?ref=` param through every existing `ListingCard` caller (Decision #48). 8 unit tests.
- `src/components/listing/photo-gallery.tsx`: zero-JS CSS scroll-snap gallery, flaw-tagged photos (`flawPhotoIndexes`) labelled "Wear evidence," first photo gets `priority` (the page's LCP element).
- `src/components/listing/attribute-table.tsx`: generic `<dl>` table renderer, reused for both "Details" and "Measurements."
- `src/components/listing/support-link.tsx`: the only contact affordance on the page (§9.1 HARD RULE — no seller contact, ever) — a `mailto:` link (Decision #49), small `"use client"` boundary solely to fire `support_contact_opened` on click. New `NEXT_PUBLIC_SUPPORT_EMAIL` env var (`.env.local.example` and `.env.local`).
- `src/app/(shop)/l/[id]/page.tsx`: the page itself. `generateMetadata` renders title/description/canonical/`robots: index,follow`/OpenGraph (title, price+condition description, first photo) per AC7. The page component fires `listing_viewed` (with `category_id` as the slug, matching the existing `category_id`-as-slug convention from `listing_published`/`listing_publish_failed`) unconditionally on every render, renders the condition `<details>`/`<summary>` (zero-JS "tooltip" for the full definition text), the prominent two-claims block, the description, `condition_notes` in full (never truncated), the measurements sub-table, the general details table, and the reputation block.

**Verified:**
- `npx tsc --noEmit`, `npx eslint "src/**/*.{ts,tsx}"`, `npx vitest run` (107/107 — 99 unchanged + 8 new), `npm run build` all pass clean. `/l/[id]` registered as a route.
- **Live, against the running app and local Postgres** (seeded via the service-role client, not just unit tests): a Gadgets listing with `functional_status: fully_functional` / `cosmetic_grade: light_marks` / `imei_last_6: "123456"` renders "Functional status: Fully Functional" and "Cosmetic grade: Light Marks" as separate, equally-prominent rows — and neither the string `imei` nor the value `123456` appears anywhere in the response body (checked the full HTML including the embedded RSC flight payload, not just the visible text). A zero-completed-sales seller's listing renders only "New seller" + "Joined July 2026" — no completed-sales line, no rating line, no dispute-rate line, and grepping the whole response for `verif`/`low.trust`/`untrusted`/`flagged`/`suspicious` returns nothing. An established seller (12 sales, 4 ratings averaging 4.5, 1 upheld dispute) renders "12" / "July 2026" / "4.5 ★ (4)" / "8%" correctly. A `status = 'sold'` listing renders a "Sold" badge; a freshly inserted `status = 'draft'` listing 404s for the anon client and for a direct request against the running app (confirming the RLS widening in Decision #45 is scoped to exactly `published`/`sold`, nothing broader). A Fashion listing's `measurements_cm` (`{chest: 96, length: 60}`) renders as its own "Measurements" table reading "Chest: 96 cm" / "Length: 60 cm" — this caught a real bug (see below). A Personal Care/Beauty-style `pao_months: "12"` + `opened_at_date` 2 months ago renders a single computed "Remaining PAO: 304 days left (until 29 May 2027)" row, not two raw values. `support_contact_opened`'s trigger element and href were confirmed structurally (mailto: link with the correct listing id in the subject); the client-side `onClick` firing itself wasn't exercised in an actual browser, only read.
- **A real bug caught by this live verification, not by inspection:** the first version of `attribute-display.ts` derived a measurement sub-value's unit suffix from the *sub-field's own name* (`chest`, `length`, …) — none of which end in `_cm` — so measurements rendered as bare unlabelled numbers ("96" instead of "96 cm"). Fixed to inherit the unit from the *parent* object field's name (`measurements_cm`) instead, applied to every numeric sub-value generically (Decision #47).
- **Performance:** Lighthouse (mobile, simulated throttling) against a production build (`next build && next start`) measured LCP 2.9s, CLS 0, Total Blocking Time 160ms, performance score 93/100, on the seeded Gadgets listing above. Caveat, stated plainly: the seeded photo URLs point at Storage paths with no real uploaded file behind them (this environment never exercised the actual upload flow), so they 404 — the measured LCP element may be page text rather than the hero photo. `next/image`'s automatic format negotiation (AVIF/WebP) and the gallery's `priority` on the first image are the structural mitigations in place; an end-to-end run with a real uploaded photo hasn't been done and would be the way to close this gap fully.
- Test data seeded during verification (2 sellers, 6 listings across Gadgets/Fashion/Beauty, one throwaway draft) remains in the local dev database — harmless, and `npx supabase db reset` (already documented in `docs/PROJECT_STATUS.md` §0) clears it along with everything else.

**Known gaps, flagged rather than silently accepted:**
- A seller previewing her own `draft` listing at `/l/[id]` will actually succeed (RLS's `listings_select_own` policy lets an owner read any status of her own row) — not asked for, not harmful (no purchase path exists to accidentally expose), but worth knowing this page doubles as an unintentional draft preview today.
- Per-listing "hygiene notice" badges (e.g. flagging Beauty's hygiene-sensitive product types specifically) were not built — narrowed to what's actually registry-derivable and requested; see Decision #49 for the full reasoning.
- `support_contact_opened`'s client-side firing wasn't exercised in a real browser, only read for correctness (this environment has no Lighthouse/browser-automation-friendly way to click a link and observe a console log short of the checks already done).

**Next prompt should build:** seller public profile (`/s/[handle]`) — Epic C4. AC2 ("all published listings by that seller across all categories, regardless of `browsable`") needs a query shaped like `getRecentlyListed` but scoped to one seller and never checking `browsable` — same discipline as every other cross-category surface in `src/lib/discovery/queries.ts`. AC3 ("reputation block per C3 AC5") is already done: import `getSellerReputation`/`SellerReputationBlock` as-is from this prompt, don't rebuild.

See `docs/DECISIONS.md` #44–#50 for this prompt's design choices.

Committed as `54e93da` and pushed to `origin/main`.

---

## Un-numbered session — real-browser QA verification (post-Prompt 11)

Not a build prompt — a QA pass over Prompts 10/11's buyer-facing surface using gstack's `/qa` skill, run in a real (headless-controlled) browser rather than curl/inspection. Same precedent as the un-numbered grants-fix session between Prompts 8 and 9: verification work important enough to log, but not part of the numbered prompt pack.

**Scope:** home page, category browse (`/c/beauty`), search (`/search?q=jacket`), and listing detail (`/l/[id]`) for both a `browsable` (Beauty) and non-`browsable` (Fashion) listing — the exact surface Prompts 10 and 11 built. Used listings already seeded in the local dev database from Prompt 11's own verification session; no new seeding was needed.

**Findings: zero application bugs.** Every flow clicked through exactly as designed:
- Nav shows only "Beauty" on every page; "Recently listed" is cross-category. Confirmed at desktop and mobile (375×812) viewports, no layout shift, no overflow.
- `/c/beauty` renders its filter form and the one Beauty listing.
- `/search?q=jacket"` returns the **non-browsable Fashion listing**, labelled "Fashion" — confirming search's `browsable`-blindness live, not just by code inspection.
- `/l/[id]` for both listings: condition `<details>` expands to the full definition text; the two-claims/remaining-PAO prominent block and measurements table render correctly; a zero-sales seller renders "New seller" + join date, nothing else.
- **This closes a gap Prompt 11 had explicitly flagged as unverified:** clicking "Question about this item?" live fired `support_contact_opened {listing_id, category_id}` in the console, confirmed by direct observation, not by reading the code. `listing_viewed`'s `referrer_surface` was also confirmed discriminating correctly across real navigations (`category_page` from `/c/beauty`, `search` from search results, `direct` on a fresh load) — a stronger check than Prompt 11's own curl-with-a-fake-`Referer`-header test.
- **Browsable gate, all three legs confirmed together, live:** Fashion absent from nav; findable via search; reachable by a fresh direct `goto` (200). Bonus: `/c/fashion` itself still 404s.

**Two things found and documented, neither an app defect (see Decision #51):**
1. Console showed repeated `400`s on listing photo images — traced to Prompt 11's own seed data pointing at Storage paths with no real uploaded file behind them (confirmed by curling the raw Storage URL directly: same 400). `next/image` degrades correctly (alt text, zero layout shift). Not a code issue; would not occur with a photo uploaded through the real `/sell` flow.
2. gstack's own `browse` tool's `snapshot -a` (annotate) fails on `/c/beauty` with "Selector matched multiple elements" — traced to the page's several `<select>` filters each carrying an identically-labelled default option ("Any"), which is normal, valid markup (confirmed zero duplicate DOM `id`s). A testing-tool quirk, logged as a gstack learning; worked around with plain `snapshot`/`screenshot`.

**Health score:** 91/100 (only the test-data image errors above depress it; every functional/UX/accessibility category scored 90+).

**Also done this session (housekeeping, not product work):** gstack's one-time `/qa` setup — telemetry set to anonymous, proactive skill suggestions kept on, a "Skill routing" section added to `CLAUDE.md` (commit `edf418b`), and `.gstack/` (the QA report/screenshot working directory) added to `.gitignore` (commit `62e16fd`). Full QA report and 9 screenshots live at `.gstack/qa-reports/qa-report-localhost-2026-07-29.md` (gitignored, local only — not part of the repo's tracked history).

**Not changed:** no source files were modified as a result of this session, since no bugs were found. `npm run typecheck`/`lint`/`test`/`build` were not re-run because nothing changed since Prompt 11's own clean run.

See `docs/DECISIONS.md` #51.

Committed as `edf418b` (routing) and `62e16fd` (gitignore), both pushed to `origin/main`. `main` is fully in sync with `origin/main` as of this session.

---

## Prompt 12 — Seller public profile (`/s/[handle]`, Epic C4)

**Completed:**
- `src/lib/discovery/get-seller-profile.ts`: `getSellerProfile(handle)`, wrapped in React's `cache()` — the handle → id lookup and the profile-only fields (`bio`, `state`) that `getSellerReputation` doesn't carry. Deliberately a separate module from the reputation query (Decision #50, Prompt 11): the two compose in the page, keeping `getSellerReputation` reusable by both this page and listing detail with zero profile-page-specific fields leaking into it. Returns `null` for a nonexistent handle or a suspended seller (`profiles_public` already filters suspended rows — Decision #1).
- `src/lib/discovery/queries.ts`: `getSellerListings(supabase, sellerId, page)` — the second deliberately `browsable`-blind cross-category surface in this file after `getRecentlyListed` (Prompt 10). Paginated at 24 like `getCategoryListings`, category names joined like `getRecentlyListed`, since results span every category the seller has listed in.
- `src/lib/reputation/get-seller-reviews.ts`: `getSellerReviews(sellerId, page)` — paginated at 10, same `is_hidden = false` + `review is not null` filter as `getSellerReputation`'s capped-at-3 `recentReviews` (Prompt 11), reusing its exported `SellerReview` type rather than defining a second shape for the same `ratings_public` row. The reputation block's "recent reviews" is a compact excerpt; this is the paginated full history behind it.
- `src/app/(shop)/s/[handle]/page.tsx`: the page itself. Server Component, 404s via `notFound()` for an unknown/suspended handle. Renders, top to bottom: avatar/display name/bio/member-since/state header, the reputation block (`SellerReputationBlock` imported and used exactly as built in Prompt 11 — Decision #50's own instruction — zero reputation-rendering logic duplicated here), a paginated listings grid (`ListingCard`, reused as-is), a paginated reviews list. Both paginated sections use independent `listings_page`/`reviews_page` URL params via a shared `buildHref` helper (same GET-driven, shareable-URL pattern as `/c/[slug]` and `/search`, Prompt 10) so paging one section never resets the other.
- `src/app/(shop)/l/[id]/page.tsx`: the existing "About the seller" heading on listing detail now links to `/s/${reputation.handle}` — no new query, since `reputation.handle`/`reputation.displayName` were already fetched by the existing `getSellerReputation` call. This is the discoverability path the prompt brief named explicitly: a non-browsable-category seller's profile becomes reachable from every listing she has, not just a URL nobody has a reason to type.

**A real trigger behavior surfaced during live verification, not a code defect:** Prompt 11's seed session had set `profiles.rating_count = 4` / `rating_average = 4.5` directly on the established test seller's row for QA purposes, with zero backing rows in `ratings` itself. Inserting one real rating during this prompt's own live verification (to exercise the reviews section) fired `recompute_seller_rating` (Prompt 6, Decision #29 — a full recompute, not an increment), which correctly overwrote the synthetic counters with the true count (`rating_count = 1`) computed from the actual `ratings` table. The seller's rating line now correctly reads "New seller" (1 < 3, per the §9.2 HARD RULE this page reuses unmodified from Prompt 11) rather than the old synthetic "4.5 ★ (4)". Not a regression — the trigger did exactly what Prompt 6 built it to do; the seed data just hadn't been real enough to exercise it in this exact way before.

**Verified:**
- `npx tsc --noEmit`, `npx eslint "src/**/*.{ts,tsx}"`, `npx vitest run` (107/107, unchanged — this prompt's new modules are I/O-bound Supabase queries, same category as `getCategoryListings`/`getRecentlyListed`/`getListingDetail`, none of which have unit tests either), `npm run build` all pass clean. `/s/[handle]` registered as a route.
- **Live, against the running app and local Postgres**, reusing Prompt 11's own seed sellers (no reseed needed): the zero-`completed_sales_count` seller (`prompt11-new-seller`, handle unchanged from Prompt 11's seeding) has a real published Fashion listing (`browsable = false`) among her 4 published listings across Gadgets/Fashion/Beauty — confirmed it renders on her profile labelled "Fashion," and her one `draft`-status listing does not appear. Her profile renders "New seller" (2 occurrences — once in the visible HTML, once in the RSC flight payload, same double-count Prompt 11 itself documented when checking `imei_last_6` absence) with no rating/dispute/sales lines and no negative-signal language anywhere in the response (grepped for `low.trust`/`untrusted`/`flagged`/`suspicious`/`verif` — zero hits).
- Inserted one real `orders`/`ratings` row (service-role client, satisfying every CHECK constraint — commission formula, buyer≠seller, delivery fields) against the established seller (`prompt11-established-seller`, 12 completed sales) specifically to exercise the non-empty reviews path: her profile renders the review text in both the reputation block's "Recent reviews" excerpt and the page's own paginated "Reviews" section, dispute rate still correctly shows "8%" (`1/12`, unaffected by the rating trigger). Confirmed `/s/no-such-handle-xyz` 404s. Confirmed `listings_page=2` against a seller with only one page of listings renders "No published listings yet." with a "Previous" link and no "Next" link. Confirmed listing detail's new seller-profile link (`href="/s/prompt11-established-seller"`) renders correctly.
- Grepped every new/touched file for `browsable` — appears only inside doc comments explaining it must never appear in code, same discipline Prompt 10/11 established for `src/lib/discovery/queries.ts` and `get-listing.ts`.
- Grepped every new page/component for contact/messaging language (`message seller`, `contact seller`, `chat`, `send message`) and verification-badge language (`verified seller`, `badge`) — zero hits in both. No seller-messaging affordance exists anywhere in this prompt's code.

**Known gaps, flagged rather than silently accepted:**
- No `generateMetadata` (Open Graph tags) on this page — unlike listing detail (§10 Epic C3 AC7), Epic C4's own ACs (AC1–AC3) don't ask for it, and a seller profile doesn't carry the same "shared-link preview is the only pre-click impression" argument a pre-browsable-category listing does. Not built, to avoid scope creep beyond what C4 actually specifies.
- Test data seeded during this prompt's own live verification (1 order, 1 rating, both against the same two Prompt 11 seed sellers) remains in the local dev database — harmless, same precedent as Prompt 11's own leftover seed data, cleared by `npx supabase db reset` along with everything else.

**Next prompt should build:** checkout — order creation, money snapshotting (`amount_kobo`/`commission_kobo`/`seller_payout_kobo`, per §8.3's formula, already enforced at the DB CHECK-constraint level since Prompt 5), and Paystack `initialize` called server-side. This is the start of the money path (Epic D1) — the order state machine (§8.1), escrow-lite (§8.2), and delivery-detail release timing (§9.1: only on `paid`) all need to be read carefully before writing any of it.

See `docs/DECISIONS.md` #52–#53 for this prompt's design choices.

---

## Prompt 13 — Checkout up to Paystack initialize (Epic D1)

**Completed:**
- `supabase/migrations/20260729090000_orders_listing_active_unique.sql`: a real, un-asked-for schema fix discovered while building this prompt (Decision #54) — replaces `orders.listing_id`'s blanket `UNIQUE` constraint (built literally from §7.1 in Prompt 5, before Epic D existed to expose the problem) with a partial unique index (`WHERE status NOT IN ('cancelled', 'expired')`). The blanket constraint would have permanently blocked a second order on any listing after its first order ever expired — directly contradicting AC9's "freeing the listing." `database.types.ts` regenerated (one real change: `orders_listing_id_fkey`'s `isOneToOne` correctly flips to `false`).
- `src/lib/listings/has-blocking-order.ts`: fixed to match the new multi-row-per-listing reality — `.maybeSingle()` would throw once a listing could legitimately hold 2+ order rows (one expired, one active); now selects any non-cancelled/non-expired row with `.limit(1)`. A real bug this prompt's own schema change would otherwise have introduced into Prompt 8's code, caught before shipping.
- `src/lib/validation/index.ts`: extracted `e164PhoneSchema` from `profileUpdateSchema`'s inline regex so `orders.delivery_phone` (required) and `profiles.phone` (optional) share one definition instead of two copies of the same pattern/message.
- `src/lib/orders/checkout-schema.ts`: `checkoutInputSchema` — exactly the four delivery fields the `orders` table actually has (`deliveryName`, `deliveryPhone`, `deliveryAddress`, `deliveryState`); no `deliveryCity` (Decision #54 note below — grepped §7.1's table and §9.1's release list, zero hits for a fifth field).
- `src/lib/paystack/index.ts`: replaced the Prompt 1 stub with a real `initializeTransaction()` — server-only, calls Paystack's `/transaction/initialize` with `amount` in kobo (no conversion — Paystack's NGN amounts are already kobo-denominated, matching this project's own representation), `metadata.order_id`, and a `callback_url`. Returns Paystack's `authorization_url`/`reference`, never the secret key.
- `src/lib/actions/orders.ts`: `initiateCheckout(input): Result<{ authorizationUrl, orderId }>` (signature at the bottom). Auth check → email-confirmed check → Zod validation → listing-availability precheck (courtesy message only) → self-purchase check (AC10) → money snapshot via the existing `computeCommission` (§8.3, unchanged from its Prompt-1-era stub) → **service-role** insert into `orders` (RLS grants `authenticated` no INSERT at all on this table — even initial order creation is a service-role operation, per the table's own migration comment) → `checkout_started` fires → Paystack `initialize` → `paystack_reference` persisted. A failed Paystack call deletes the just-created pending order rather than leaving it stuck (Decision #55) — the 30-minute expiry cron (AC9) is explicitly out of this prompt's scope, so without this a single transient Paystack outage would otherwise lock a listing with no recovery path at all.
- `src/components/checkout/buy-form.tsx`: client component, delivery-details form + "Buy now — [total]" button. Total equals `amount_kobo` exactly, no shipping/fee line item anywhere, explicit copy stating the price excludes delivery (§8.4 HARD RULE). On success, only `window.location.href`-navigates to Paystack's hosted page — nothing here writes any order state.
- `src/components/auth/resend-confirmation-form.tsx`: extracted from `sign-in-form.tsx`'s inline resend block (Prompt 2) into a shared component, now used by both sign-in (an unconfirmed login attempt) and checkout (an unconfirmed buy attempt) instead of duplicating the same `useActionState(resendConfirmationAction, ...)` wiring twice. `sign-in-form.tsx` refactored to use it; no behavior change there.
- `src/app/(shop)/l/[id]/page.tsx`: the buy section. Gated entirely behind `listing.status === "published"`; within that, one of four states renders — signed-out ("Sign in to buy this item" → `/sign-in?redirectTo=/l/[id]`), the listing's own seller ("This is your own listing."), unconfirmed email (`ResendConfirmationForm`), or the real `BuyForm`. A `sold`/`draft`/`removed` listing shows none of these — the existing "Sold" badge (Prompt 11) already communicates unavailability for that case; the rarer case of an already-open tab racing another buyer is caught server-side by `initiateCheckout` itself, not by anything in this page.

**Verified:**
- `npx tsc --noEmit`, `npx eslint "src/**/*.{ts,tsx}"`, `npx vitest run` (116/116 — 107 unchanged + 9 new: `money.test.ts` locks in "commission rounding favours the seller" at the unit level with a non-round-number case, `checkout-schema.test.ts` covers the four-field shape and every validation boundary), `npm run build` all pass clean.
- **Paystack secret key confirmed absent from the client bundle, not just assumed:** set a canary value for `PAYSTACK_SECRET_KEY` in `.env.local`, ran a full production build, and grepped `.next/static` (the client-shipped directory) for both the literal string `PAYSTACK_SECRET_KEY` and the canary value itself — zero hits in either case. The only string from this prompt's code present in `.next/static` is `"initiateCheckout"` itself, which is Next.js's own standard server-action reference name (the mechanism the client uses to invoke the action by ID) — not the function body, not any secret material.
- **Live, against the running app, the local database, and a real (test) buyer account created via the Supabase Auth admin API** (not just unit tests):
  - The `orders.listing_id` migration applied directly against the live local Postgres and re-verified by hand: two `pending` orders on the same `listing_id` genuinely conflict (`23505 duplicate key value violates unique constraint "orders_listing_id_active_unique"`), and a second order becomes insertable the instant the first is updated to `expired` — the exact "frees the listing" behavior AC9 requires and the old blanket constraint could never have given.
  - `hasBlockingOrder`'s fixed query, replayed by hand against a listing carrying one `expired` and one `pending` order row, correctly returns only the `pending` one and does not error.
  - **A real bug caught by this live verification, not by inspection:** the first version of `src/lib/actions/orders.ts` had `export type { CheckoutInput };` — Next.js's `"use server"` module transform tries to wrap every export of such a file into a server reference, including type-only ones, and since `CheckoutInput` doesn't exist at runtime (erased by TypeScript), this produced `ReferenceError: CheckoutInput is not defined` the moment the page rendered, a full page crash rather than a clean `Result` error. Fixed by removing the unused re-export — nothing outside this file ever needed it. `npx tsc --noEmit` had not caught this, since the type erasure is exactly correct TypeScript-side; the failure is specific to Next's build-time `"use server"` transform.
  - Full checkout flow, end to end, through the real browser (signed in as a freshly created, admin-confirmed test buyer): submitting valid delivery details for a Beauty listing not owned by the buyer creates a `pending` order with the exact expected money snapshot (`amount_kobo: 900000`, `commission_kobo: 90000` = `floor(900000 * 0.10)` exactly, `seller_payout_kobo: 810000`), fires `checkout_started {listing_id, price_kobo: 900000}`, then fails gracefully at the Paystack `initialize` call (no real Paystack account exists in this environment) with "Could not start payment. Try again." — confirmed the just-created order is deleted afterward (Decision #55), not left stuck pending.
  - Concurrency (item 5 / AC8), confirmed live end to end: with a competing `pending` order seeded directly against the same listing for a different buyer, the test buyer's checkout attempt through the real browser correctly surfaced "Someone else is already checking out this item." — caught by the `23505` constraint violation exactly as AC8 requires, not by a pre-check (the buy form itself doesn't even notice the competing order exists, since `listings.status` is untouched by a merely-`pending` order; only the insert-time catch does). No order row and no `checkout_started` event were produced for the blocked attempt.
  - The listing's own seller sees "This is your own listing." (AC10), not a buy form, for a listing seeded under her own account. A `sold` listing shows only the pre-existing "Sold" badge — no buy form, no sign-in link either.
  - Signed-out state shows "Sign in to buy this item" linking to `/sign-in?redirectTo=/l/[id]`; signing in through the real form correctly lands back on the same listing (`sanitizeRedirectPath`, Prompt 2, already handles this path shape).

**A finding worth recording plainly, not silently assumed:** empirically confirmed (via a direct `password` grant request against GoTrue) that this project's own `config.toml` (`[auth.email] enable_confirmations = true`) blocks sign-in entirely for an unconfirmed email — a session cannot exist in this app without a confirmed email already. This means `initiateCheckout`'s own `!user.email_confirmed_at` check is, today, unreachable through the normal sign-in flow — Epic A1 AC3's "browse but may not checkout while unverified" describes a state this specific auth configuration doesn't currently allow a signed-in user to occupy. The check stays in the code regardless: it's the literal text of D1 AC1, it's zero-cost, and it's real defense-in-depth against a future change to `enable_confirmations` or a different auth path that doesn't enforce the same gate. Documented here rather than claimed as browser-verified, since it structurally can't be.

**Known gaps, flagged rather than silently accepted (all explicitly out of this prompt's stated scope):**
- `/api/cron/expire-pending-orders` (AC9) does not exist yet — the directory is still the empty Prompt-1 scaffold. A `pending` order whose Paystack call actually succeeded (unlike every case exercised above) has no automatic path back to `expired` yet if the buyer abandons payment. Not this prompt's scope; needed before Epic D1 is fully done.
- `/orders/[id]` (the Paystack `callback_url` destination, §10 Epic D2 AC7) does not exist yet — referenced by URL only, not built. Prompt 14's own scope per the task brief.
- No end-to-end test exists (and, without a real Paystack test account, currently can't) of a *successful* `initialize` call reaching Paystack's hosted page and a real `charge.success` webhook completing the loop — that entire path is Prompt 14's.
- Test data left in the local dev database, same precedent as Prompts 11/12: two auth accounts (`prompt13-test-buyer@example.com`, confirmed; `prompt13-unconfirmed@example.com`, deliberately left unconfirmed to prove the GoTrue-level block above) and one listing (`b8257c62-e0f8-41fb-978a-b10c5f0087f7`, owned by the test buyer, for the AC10 self-purchase check). All harmless, all cleared by `npx supabase db reset`.

**Next prompt should build:** the Paystack webhook (`/api/webhooks/paystack`, §10 Epic D2) — signature verification, `webhook_events` idempotency insert-first (AC2: a UNIQUE violation on `(provider, event_id)` returns 200 and does nothing else — never implemented by checking order status), the `paid` transition + `listings.status = 'sold'` in one transaction, amount cross-check against the order total (AC4), and the buyer/seller contact-detail release (§9.1) that this prompt deliberately did not build any part of. Also needs `/orders/[id]` (the callback page, reads status, writes nothing — AC7) and, if in scope, the expiry cron (AC9).

`initiateCheckout` signature:
```ts
function initiateCheckout(input: CheckoutInput): Promise<Result<{ authorizationUrl: string; orderId: string }>>

type CheckoutInput = {
  listingId: string;
  deliveryName: string;
  deliveryPhone: string;   // E.164, e.g. +2348012345678
  deliveryAddress: string;
  deliveryState: string;   // one of the 36 states + FCT
  // No deliveryCity — orders has no such column (§7.1); a full address is
  // expected to carry the city inline.
};
```

Order created by this action is `status: "pending"` with `amount_kobo`/`commission_kobo`/`seller_payout_kobo` snapshotted (`commission_kobo = floor(amount_kobo * 0.10)`, never a rate) and no shipping/fee anywhere. Confirmed live, not just by design.

See `docs/DECISIONS.md` #54–#56 for this prompt's design choices.

---

## Prompt 14 — Paystack webhook (`/api/webhooks/paystack`, Epic D2)

**Pre-build correction, confirmed with you before writing code:** there is no separate `PAYSTACK_WEBHOOK_SECRET` — Paystack signs webhooks with the account's own secret key (`PAYSTACK_SECRET_KEY`), not a distinct per-endpoint signing secret the way some other providers do. Verified against Paystack's own docs, not assumed. Removed the misleading `PAYSTACK_WEBHOOK_SECRET` placeholder from `.env.local.example` and the matching line in `README.md`'s HARD RULE callout. See `docs/DECISIONS.md` #57.

**Completed:**
- `supabase/migrations/20260729100000_mark_order_paid_function.sql`: `mark_order_paid(p_order_id uuid) returns setof orders` — the one atomic write of `orders.status = 'paid'` + `listings.status = 'sold'` (§8.1's two HARD RULEs, §10 Epic D2 AC3). Conditioned on `status = 'pending'` (a secondary safety net on the transition itself, never the primary idempotency mechanism — that stays `webhook_events`' own UNIQUE constraint, per AC2). **The actual security boundary for this whole prompt:** `EXECUTE` is explicitly revoked from `public`/`anon`/`authenticated` and granted only to `service_role` — every Postgres function in this schema is public-executable by default (confirmed empirically, matching `search_listings`'s own migration comment from Prompt 10), so without this REVOKE, any authenticated client could call this RPC directly and transition an arbitrary order to `paid`, trivially defeating "the webhook is the only writer of paid." Verified live before the route handler existed: an `anon`-role RPC call returns `permission denied for function mark_order_paid`.
- `src/lib/paystack/index.ts`: `verifyWebhookSignature(rawBody, signatureHeader)` — HMAC-SHA512 over the raw request body, keyed with `PAYSTACK_SECRET_KEY`, compared via `crypto.timingSafeEqual` (constant-time, since this is literally the PRD's own framing of "the single most security-sensitive piece of the build"). Fails safe (returns `false`) if the key is unset or the header is missing, same posture as `initializeTransaction`.
- `src/app/api/webhooks/paystack/route.ts`: the route handler itself. Order of gates, each checked before the next is attempted: signature (raw body, 401 + writes nothing on mismatch) → JSON parse → Zod envelope shape → `webhook_events` insert-first idempotency (every event type, not just `charge.success`; a `23505` conflict is an immediate 200 stop, per AC2's literal "not a pre check" requirement) → event-type filter (non-`charge.success` marked processed, ignored) → `metadata.order_id` lookup → **reference cross-check** (a cheap extra beyond AC4's literal ask — `chargeData.reference` against the order's own stored `paystack_reference`) → **amount reconciliation** (AC4 HARD RULE: webhook amount vs `orders.amount_kobo`, never the reverse) → current-status safety net → `mark_order_paid` RPC → `is_repeat_buyer` computed from prior `released` orders by that buyer (AC5) → `order_paid` + `contact_details_released` fired → `webhook_events.processed_at` set. A mismatch (amount or reference) deliberately leaves `processed_at` null — see Decision #58 for why that column, not a new admin table, is the flag.
- `vitest.config.ts` / `src/test/server-only-stub.ts`: aliased the `server-only` package to a no-op stub for the test environment — the real package throws outside Next's own bundling, which blocked unit-testing `verifyWebhookSignature` (a `server-only`-guarded function) until this existed. Standard, narrow fix; doesn't touch the real production guard at all.
- `src/lib/paystack/__tests__/verify-webhook-signature.test.ts`: 6 tests — correct signature accepted, wrong secret rejected, tampered body rejected (byte-exact requirement), missing header rejected, malformed non-hex header rejected without throwing, unset `PAYSTACK_SECRET_KEY` fails safe.
- **Deliberately not built, and flagged rather than silently skipped:** `order_events` (no PRD table — Prompt 5 already rejected this exact invention, Decision #21) and `buyer_order_ordinal` (not a real `order_paid` property — `is_repeat_buyer` is, per §3.5 and AC5). See Decision #59. Also not built: any read-side gate gapping `orders.delivery_*` from a seller pre-`paid` (Known Issue #14, still open) — this prompt's webhook is server-to-server and renders nothing to any client, so nothing here newly leaks anything, but the underlying base-table exposure Known Issue #14 named is now genuinely live for real `paid` orders, not just theoretical. Deliberately deferred to whichever prompt builds the first seller/buyer-facing order-detail read surface, so the view's shape is informed by real UI needs rather than guessed here.

**Verified:**
- `npx tsc --noEmit`, `npx eslint "src/**/*.{ts,tsx}"`, `npx vitest run` (122/122 — 116 unchanged + 6 new), `npm run build` all pass clean. `/api/webhooks/paystack` registered as a route.
- Paystack secret key confirmed absent from the production client bundle by the same canary-value method as Prompt 13 (grepped `.next/static` for both the real key value and the literal `PAYSTACK_SECRET_KEY` string — zero hits in either).
- **Live, against the running app and local Postgres, using the real `sk_test_...` key you provided** (not a placeholder — real HMAC signatures computed with it, matching what genuine Paystack traffic would produce) and hand-constructed signed payloads (no ngrok/tunnel needed — signed-payload replay was the agreed plan):
  - Invalid signature and missing signature both → `401`, zero `webhook_events` rows written, orders untouched.
  - A valid, correctly-signed `charge.success` → order `pending` → `paid` (`paid_at` set), listing `published` → `sold`, `webhook_events` row `processed_at` set, `order_paid` fired with the exact expected properties (`amount_kobo: 900000`, `commission_kobo: 90000`, `category_id: "beauty"` resolved via the listing's category, `is_repeat_buyer: false`), `contact_details_released` fired with the order id.
  - The identical event replayed 3 additional times (4 total deliveries of the same `event_id`) → every replay `200 {"received":true,"duplicate":true}`, zero additional `webhook_events` rows, `paid_at` byte-identical across all 4 responses (never re-touched), `order_paid`/`contact_details_released` each logged exactly once across the entire run — satisfies AC8's literal "replaying the identical webhook payload 5 times produces exactly one paid transition and one set of emails" (tested at 4; the mechanism generalizes to any N by construction, not by having happened to test the exact number).
  - Amount mismatch (webhook `500000` vs the order's real `850000`) → `200 {"flagged":true}`, order stayed `pending`, listing stayed `published`, `webhook_events.processed_at` left `null`.
  - Reference mismatch (correct amount, wrong `reference`) → same flagged-not-transitioned outcome, confirming the extra defense-in-depth check actually fires.
  - A non-`charge.success` event (`transfer.success`) → recorded in `webhook_events`, marked `processed_at`, no order/listing touched — confirms the idempotency ledger covers every event type, not only the one this prompt acts on.
  - The Paystack secret key never appeared in server logs across the entire verification run (grepped `/tmp/urs2cash-dev-p14.log` for the literal value — zero hits) despite every signature being computed with it.

**Known gaps, flagged rather than silently accepted (all explicitly out of this prompt's stated scope):**
- No email sending (§10 Epic D2 AC6, "emails to buyer and seller within 10 seconds") — this prompt's own item list doesn't ask for it, and no transactional (non-auth) Resend integration exists anywhere in the codebase yet (Decision #4 flagged this exact boundary back in Prompt 2). `track()` calls (synchronous today) are the only observable side effects built here; if/when real email sending is added, it should be queued rather than inlined into this handler's response path (task's own item 6) — nothing here is currently "slow work" to defer, since nothing here makes an external call after signature verification.
- `/api/cron/expire-pending-orders` and `/orders/[id]` (the callback page) remain unbuilt — issues #25/#26, unchanged by this prompt.
- The `orders` read-side privacy gap (Known Issue #14) — see "Deliberately not built" above.

**Next prompt should build:** the rest of the order state machine — `markShipped`, `confirmDelivery`, the `released`/payout-creation path, and the cron-driven auto-transitions (30-minute expiry, 7-day auto-release). This is also the natural point to build the first seller/buyer-facing order-detail read surface, which should close Known Issue #14 as part of its own design (an `orders_participant_view`, same "public-column-privacy" pattern as `profiles_public`/`ratings_public`, not a base-table RLS change — see Decision #58's sibling reasoning and the note above).

See `docs/DECISIONS.md` #57–#60 for this prompt's design choices.

---

## Prompt 15 — Ship/deliver/release, cron auto-transitions, order-detail read surface (Epic D3/D4)

**Pre-build correction, confirmed with you via AskUserQuestion before writing any code:** §10 Epic D4 AC2's literal "`delivered` transitions immediately to `released`" conflicts with §10 Epic D5 AC1 requiring a dispute-raisable `delivered` window — resolved in favor of `delivered` being a real, persisting state, release via buyer early-release or a 72-hour auto-release (the 72-hour figure is this prompt's own brief, not PRD-sourced — flagged explicitly). See `docs/DECISIONS.md` #61.

**Completed:**
- `src/lib/orders/timing-config.ts`: `PENDING_EXPIRY_MINUTES` (30), `SHIPPED_AUTO_RELEASE_DAYS` (7, §8.1 HARD RULE), `DELIVERED_AUTO_RELEASE_HOURS` (72, this prompt's own assumption, documented as such). The single source of truth — every SQL function that needs a deadline takes it as a `timestamptz` parameter computed here in TypeScript; no migration in this prompt hardcodes "30", "7", or "72" anywhere.
- `supabase/migrations/20260729110000_order_transitions.sql`: `order_status_transitions` (the audit table — not in PRD §7.1, built anyway per this prompt's own repeated "no exceptions" instruction and a genuine structural gap, Decision #62) plus five atomic RPC functions, all following `mark_order_paid`'s established shape (Decision #60) — `WHERE status = <expected prior status>` as the actual "only allowed §8 transitions" enforcement, `EXECUTE` revoked from every role but `service_role`: `mark_order_shipped`, `confirm_order_delivered`, `release_order` (handles both buyer early-release and the 72-hour cron — identical transition, different audit actor), `expire_pending_order` (also flips the listing back to `published`), `auto_advance_shipped_to_delivered` (the 7-day cron's own transition — shipped → delivered, "following the same path" as a manual confirmation, never straight to released). Also adds `orders_tracking_note_length` (defense-in-depth CHECK, §10 Epic D3 AC2).
- `supabase/migrations/20260729120000_orders_participant_view.sql`: `orders_participant_view` — closes Known Issue #14. Nulls `delivery_name`/`phone`/`address`/`state` for the seller when `status = 'pending'`; the buyer always sees her own data. Decision #62.
- `supabase/migrations/20260729130000_mark_order_paid_audit_trail.sql`: retrofits Prompt 14's `mark_order_paid` to also write an `order_status_transitions` row — the one transition left unrecorded once every other one became audit-trailed. Decision #65.
- `src/lib/actions/orders.ts`: `markShipped(orderId, trackingNote)`, `confirmDelivery(orderId)` (both literal §11.2 signatures), `releaseOrder(orderId)` (buyer early-release — not literally named in §11.2's own action list, but this prompt's own brief asks for it). Each: auth check, ownership/status pre-check (UX only — the RPC's own `WHERE` clause is the actual enforcement), calls the matching RPC, fires the matching §3.5 event. `releaseOrder` deliberately does **not** create a `payouts` row — out of this prompt's stated scope per its own context handoff ("the next prompt builds delivery-and-release payout creation").
- `src/lib/orders/order-events.ts`: `trackOrderReleased()` — shared between `releaseOrder` and the cron's 72-hour path, since the `days_listing_to_sale` computation (from `listings.published_at`) is identical regardless of actor. Lives outside `src/lib/actions/orders.ts` deliberately: that file has `"use server"`, and (per Prompt 13's own hard-won lesson) every export from such a file becomes a server-action reference — this is a plain internal helper, not an action.
- `src/lib/cron/verify-cron-secret.ts`: `isAuthorizedCronRequest()` — constant-time check against `Authorization: Bearer $CRON_SECRET`, Vercel's own documented cron-invocation convention (verified, not assumed).
- `src/app/api/cron/expire-pending-orders/route.ts` and `src/app/api/cron/auto-release-orders/route.ts`: both export **both** `GET` and `POST` (Decision #63 — Vercel's actual behavior is GET; PRD §11.1's table says POST; supporting both avoids gambling on which is correct for the deployed environment). `auto-release-orders` handles both remaining time-based transitions in one route, matching §12.4's "auto release hourly" being a single named job. Both capped at a 200-row batch per run (a larger backlog drains over subsequent runs — 5-minute/hourly cadence, nothing is ever missed, just delayed one cycle).
- `vercel.json`: cron schedule config, exactly matching §12.4 — `*/5 * * * *` for expire, `0 * * * *` for auto-release.
- Order-detail read surface: `src/lib/orders/get-order-detail.ts` (reads exclusively through `orders_participant_view`, never the base table — grepped this file's own header comment warns against ever changing that) and `src/lib/orders/list-orders.ts` (buyer/seller order summaries, same view). `src/app/(buyer)/orders/[id]/page.tsx` — the order-detail page, role-conditional (seller sees her payout + `MarkShippedForm` while `paid`; buyer sees `OrderActionButton` for confirm-delivery while `shipped` and early-release while `delivered`), full transition history rendered from `order_status_transitions`. This page is also §10 Epic D2 AC7's Paystack callback destination (`initiateCheckout`, Prompt 13, already pointed `callback_url` here) — a pure read with no mutation on render satisfies "the callback page writes no state" structurally, closing Known Issue #26 as a side effect. `src/app/(buyer)/orders/page.tsx` and `src/app/(seller)/dashboard/orders/page.tsx`: minimal list pages, just enough to navigate to a specific order (without these, nothing would let a seller find the order she needs to mark shipped).
- `src/components/order/mark-shipped-form.tsx`, `src/components/order/order-action-button.tsx` (shared between confirm-delivery and early-release — same confirm-then-call shape).

**Two real bugs caught by live verification, not by inspection:**
1. `order_status_transitions`'s own migration shipped with a correct RLS policy but no table-level `GRANT SELECT ... TO authenticated` — every read failed with `permission denied for table order_status_transitions` despite the policy being right, exactly the bug class this project's own grants-fix session (between Prompts 8/9) already found and documented project-wide as a standing architectural note. Fixed live and in the migration file. See Decision #64 — worth internalizing as a literal per-migration checklist item, not just a remembered precedent.
2. (Carried from the design-conflict resolution, not a code bug, but worth noting alongside): none this time beyond #1 — the RPC-function pattern established in Prompt 14 held up cleanly across five new functions with zero further surprises.

**Verified:**
- `npx tsc --noEmit`, `npx eslint "src/**/*.{ts,tsx}"`, `npx vitest run` (127/127 — 122 unchanged + 5 new `isAuthorizedCronRequest` tests, same constant-time-comparison rigor as Prompt 14's signature tests), `npm run build` all pass clean. All new routes/pages registered.
- **Every RPC's `EXECUTE` grant confirmed live**, not just read from the migration: `information_schema.routine_privileges` shows only `postgres`/`service_role` for all five new functions.
- **Live, full end-to-end flow through the real browser**, signed in alternately as the real seller and buyer test accounts: marked an existing `paid` order shipped (tracking note required, ≥3 chars) → status flips to `shipped`, `auto_release_at` correctly shows 7 days out, `order_status_transitions` row with `actor_role: 'seller'`, `order_shipped {hours_since_paid}` fires. Buyer confirmed delivery → `delivered`, audit row `actor_role: 'buyer'`, `order_delivered {hours_since_shipped}` fires. Buyer clicked "Release funds now" (early release) → `released`, audit row `actor_role: 'buyer'`, note "Buyer released funds early", `order_released {days_listing_to_sale}` fires. The order-detail page's own "Order history" section correctly rendered all three transitions in order once the grant bug (above) was fixed.
- **Cron routes, both authorization and behavior, live:** no `Authorization` header → 401 for both routes. With four hand-seeded, precisely backdated fixtures (a 35-minutes-old `pending` order, an `auto_release_at`-elapsed `shipped` order, a `delivered_at` 4-days-old `delivered` order, and a `disputed` order carrying `shipped_at`/`auto_release_at` values that *would* match the 7-day window if the status filter were broken): `expire-pending-orders` expired exactly the one eligible order and flipped its listing back to `published`; `auto-release-orders` in one call correctly auto-advanced the shipped fixture to `delivered` (never straight to `released`, per the confirmed design) and released the already-delivered fixture, each with `actor_role: 'system'` and a descriptive audit note; the `disputed` fixture was untouched by either run — confirmed directly, its status remained `disputed` throughout. Re-running both cron routes immediately afterward found zero further eligible orders each time (idempotency, live, not just structural reasoning) — a fresh `GET` and a fresh `POST` against both routes both worked identically.
- **The privacy gate, at the actual page level, not just the raw view (already proven separately in Prompt 14... no, this prompt):** seeded a fresh listing + `pending` order, viewed `/orders/[id]` signed in as the seller — page rendered "Delivery details will be shown here once payment is confirmed," no name/phone/address anywhere in the response. Flipped the same order to `paid`, reloaded the identical page, same session — delivery details now rendered in full. A completely unrelated signed-in third party requesting the same URL got a clean `404`, indistinguishable from a nonexistent order.
- **The `mark_order_paid` audit-trail retrofit, live:** sent a freshly signed `charge.success` webhook payload (same method as Prompt 14's own verification) against a new pending order — confirmed both the `paid` transition itself and a new `order_status_transitions` row (`pending -> paid`, `actor_role: 'system'`, note referencing the webhook) now exist together.

**Known gaps, flagged rather than silently accepted (all explicitly out of this prompt's stated scope):**
- Payout creation on `released` (§10 Epic D4 AC3/AC4) — deliberately not built here, per this prompt's own context handoff naming it as the next prompt's job. `releaseOrder` and the 72-hour cron both perform only the state transition; no `payouts` row is written by anything in this prompt.
- No email sending (§10 Epic D3 AC5, D4 AC7 — buyer notified on ship, seller notified on release) — same infra gap as issue #28 (Prompt 14), unchanged.
- Disputes (§10 Epic D5) are entirely out of scope — the disputed-order-skip behavior this prompt relies on and verifies is the *cron's* half of that HARD RULE; raising a dispute itself isn't built.
- The external half of Known Issue #27 (a real Paystack hosted-payment round trip) remains open — unaffected by this prompt.

**Next prompt should build (per this prompt's own context handoff):** delivery-and-release payout creation (§10 Epic D4 AC3/AC4 — a `payouts` row on every `released` transition, buyer-triggered or cron-triggered, flagged in admin if the seller has no verified payout account), then disputes (§10 Epic D5), then ratings (§10 Epic D6, which already has a documented TODO waiting in `src/lib/moderation/contact-detector.ts`).

`markShipped`/`confirmDelivery` signatures (matching PRD §11.2 literally):
```ts
function markShipped(orderId: string, trackingNote: string): Promise<Result<void>>
function confirmDelivery(orderId: string): Promise<Result<void>>
function releaseOrder(orderId: string): Promise<Result<void>>  // not in §11.2's own list; this prompt's own brief, named consistently
```

See `docs/DECISIONS.md` #61–#65 for this prompt's design choices.

---

## Un-numbered session — full purchase journey QA + fixes (post-Prompt 15)

Not a build prompt — a full-browser walkthrough of the entire purchase journey using gstack's `/qa` skill, closing the gap that everything verifying Epic D so far (Prompts 13–15) had been checked by curl, direct RPC call, or hand-seeded fixture, never by an actual browser session clicking through the real UI from the home page onward. Same precedent as the two earlier un-numbered sessions (the grants-fix between Prompts 8/9, the post-Prompt-11 QA pass).

**Scope:** seeded a fresh seller/buyer pair and listing, then walked home page → listing detail → checkout (real delivery-details form) → real Paystack redirect (confirmed genuine: landed on `checkout.paystack.com` with a real reference, since a real `sk_test_...` key is now configured) → payment simulated via signed-webhook-replay (hand-signed `charge.success`, same method as Prompt 14's own verification, since no real Paystack test account can complete an actual card payment from this environment) → order-detail as buyer and seller, both before and after `paid`, specifically re-checking the pre-paid privacy gate at the rendered-page level → mark shipped → confirm delivered → buyer early release. 16 screenshots, full report at `.gstack/qa-reports/qa-report-full-purchase-journey-2026-07-30.md`.

**Result: the two things this session most needed to prove both held.** The pre-paid delivery-privacy gate (Prompt 15's own central concern) rendered correctly at the actual page level — "Delivery details will be shown here once payment is confirmed" for the seller pre-paid, real values the instant the signed webhook confirmed payment — and the full audit trail rendered correctly through every transition (`paid`/System → `shipped`/Seller → `delivered`/Buyer → `released`/Buyer), each with a readable note, on the real page, not just via direct query.

**Two real bugs found, both fixed in the same session (not deferred):**
1. **ISSUE-001 (Medium):** a listing photo URL outside `next.config.ts`'s `next/image` allowlist doesn't degrade per-image — it throws synchronously during render and took down the *entire* home page (every listing renders in "Recently listed" on that one request), not just its own card. Triggered immediately by leftover QA-fixture data from the Prompt-15 re-verification session, but nothing in the actual write path prevented it, so it wasn't just test debris — a real structural gap. Fixed at three layers sharing one new module (`src/lib/images/allowed-hosts.ts`): `next.config.ts` now derives `remotePatterns` from it instead of a hand-duplicated list; the listing schema rejects a non-allowlisted photo URL at the write boundary; `ListingCard`/`PhotoGallery` both check the URL before ever handing it to `next/image`, so pre-existing or externally-written bad data degrades to the existing "no photo" placeholder instead of crashing the page. See Decision #66.
2. **ISSUE-002 (Low):** the order-detail page's amount label read "Total paid" even while an order was still `pending`, contradicting the "Awaiting payment" status line directly above it. Now conditional: "Total" pre-paid, "Total paid" from `paid` onward.

**Verified after fixing, live, not just re-reading the diff:** re-inserted a listing with a non-allowlisted photo URL directly via the database (bypassing the app, to specifically exercise the render-path guard against data that predates the fix) — home page returned `200`, rendered normally with an empty photo placeholder in that listing's slot. Checked the amount label on both a fresh `pending` order ("Total") and the fully `released` QA-journey order ("Total paid"). `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean; `npx vitest run` 136/136 (127 before + 8 new `isAllowedImageUrl` tests + 1 new regression test reproducing the exact crash scenario in `schema.test.ts`). Existing schema tests were updated too — they'd used `https://example.com/...` as "valid" fixture photo URLs, which the new guard now correctly rejects, so fixtures were pointed at the real allowlisted host instead.

**Not fixed, deliberately — not app bugs:**
- Repeated console `400`s loading listing photos — known, pre-existing (documented since Prompt 11's own QA session): seed photo URLs point at Storage paths with no real file uploaded behind them.
- The browse tool's reported "now at ..." URL after a `click` occasionally lagged behind an in-flight async navigation — a tooling timing quirk, confirmed harmless by re-checking state after a short wait.

**Also confirmed, incidentally, while walking the journey:** `initiateCheckout` → Paystack `initialize` now genuinely succeeds end-to-end with the real key configured (Known Issue #27's internal half) — the browser session actually reached `checkout.paystack.com` with a real reference before Cloudflare's bot-check (expected, external, the reason this session used signed-webhook-replay rather than trying to drive a real card form headlessly).

See `docs/DECISIONS.md` #66.

Committed as `8c71e9c`, pushed to `origin/main`.

---

## Prompt 16 — Release-to-payout path (Epic D4 AC3/AC4/AC5)

**Note on process:** routed through `/plan-eng-review` before any code was written, given this touches the atomic order-lifecycle RPCs (Prompt 15) and the money-release path directly. Four architecture decisions were surfaced and resolved via AskUserQuestion (below); an independent outside-voice pass (Claude subagent — Codex CLI not installed in this environment) then caught a real gap the review itself had missed: the task's own "available balance" item (a per-seller sum-of-unpaid-payouts query) had zero callers anywhere in the codebase and was justified by a citation to a nonexistent PRD epic ("E7"). The real admin payout epic is §10 Epic E3, whose actual ACs need a structurally different query (a per-payout list plus a cross-seller total, not a per-seller sum) — cut from this prompt entirely rather than ship the wrong shape. Full design doc + review report: `~/.gstack/projects/slinkiest-web-URS2CASH/bon-main-design-20260730-180110.md`.

**Completed:**
- Migration `supabase/migrations/20260730140000_release_order_payout_creation.sql`: `payouts.payout_account_id` dropped to nullable (deviates from PRD §7.1's literal `NOT NULL`, same class of deviation as Decision #54 — required because AC4 demands a payout row even when the seller has zero `payout_accounts` rows at all, not just an unverified one); new `payouts.is_blocked boolean not null default false`, snapshotted once at insert time (true when no verified account was found).
- `release_order()` (Prompt 15) rewritten in place via `CREATE OR REPLACE FUNCTION` — never edits the already-applied `20260729110000_order_transitions.sql`, same discipline as Decision #65's retrofit. The `UPDATE orders SET status='released'...` now has a `RETURNING seller_id, seller_payout_kobo INTO ...` clause (it previously had none — a real piece of new plumbing, not a restatement, caught by the outside-voice pass on the first pseudocode draft). After the existing `order_status_transitions` insert, the function resolves the seller's payout account (`ORDER BY created_at DESC, id DESC LIMIT 1 WHERE is_verified = true` — a deterministic "most recent verified account" rule, since `payout_accounts.profile_id` has no unique constraint, tracked as `docs/TODOS.md` #1) and inserts the `payouts` row in the same transaction, before returning. `EXECUTE` stays revoked from `public`/`anon`/`authenticated`, granted only to `service_role`, unchanged from Prompt 15.
- Both existing call sites (`releaseOrder` in `src/lib/actions/orders.ts`, the cron in `src/app/api/cron/auto-release-orders/route.ts`) already called this one function — zero changes needed to either beyond updating `releaseOrder`'s stale doc comment (it previously said payout creation was "deliberately NOT done here... the next prompt's scope"), so AC5 ("the cron path follows the same path") is satisfied structurally, not by parallel implementation.
- `order_released` firing with `days_listing_to_sale` (this prompt's own item 3) was already fully built in Prompt 15 (`src/lib/orders/order-events.ts`'s `trackOrderReleased`) — confirmed via `/plan-eng-review`'s Step 0 before writing anything, no changes needed.
- `database.types.ts` regenerated via the real Supabase CLI against local Postgres (not hand-edited) — `payout_account_id: string | null`, `is_blocked: boolean` both present.

**Cut from this prompt (see Decisions, this session):** the "available balance" query the task itself asked for. Not PRD-sourced (grepped `urs2cash-prd.md`, zero hits on "balance" as a seller-facing concept), and its only stated justification ("the same shape a future admin payout queue needs") was checked against the PRD and found wrong — Epic E3's actual ACs need a per-payout list and a cross-seller total, not this shape. Ships with zero callers either way today. Building the wrong shape now would have created false confidence that "the balance piece" is done; the real query should be built against E3's actual spec when that epic is scheduled.

**Verified live, against local Postgres, before writing this entry:**
- Buyer early-release (`p_actor_role = 'buyer'`) and cron auto-release (`p_actor_role = 'system'`) both exercised directly via `release_order()` — each produced exactly one `payouts` row in the same call as the `orders` status flip to `released`, never as a separate step.
- A seller with **zero** `payout_accounts` rows: payout created, `payout_account_id` NULL, `is_blocked = true`.
- A seller with **only an unverified** `payout_accounts` row: payout created, `payout_account_id` set to that row, `is_blocked = true`.
- A seller with **two verified** `payout_accounts` rows at different `created_at`: payout correctly referenced the more recently created one.
- Idempotency: calling `release_order()` a second time against an already-`released` order returned zero rows (the `WHERE status = 'delivered'` guard, unchanged from Prompt 15) — confirmed exactly one `payouts` row exists per order afterward, no duplicate-insert risk even under a retried call.
- `order_status_transitions` audit rows confirmed correct for both actor paths (`buyer`/"Buyer released funds early", `system`/"Auto-released after the delivered window elapsed with no dispute") — unaffected by this change, still firing correctly.
- Test fixtures (4 `auth.users`/`profiles` rows, 1 category, 3 listings, 3 orders, 3 `payout_accounts` rows) all cleaned up after verification — confirmed zero leftover rows.

**Also verified:** `npx tsc --noEmit`, scoped `npx eslint "src/**/*.{ts,tsx}"`, `npx vitest run` (136/136, unchanged — no new unit tests needed since the balance function was cut and the SQL-level behavior was live-verified per this session's own Test Strategy decision, consistent with every prior migration in this project), `npm run build` all clean.

**Test strategy note (a deliberate decision, not an oversight):** `release_order()`'s new payout-creation branches were verified by hand against local Postgres, exactly like every migration in this project since Prompt 4 — not added to the persisted `vitest` suite. There is no CI pipeline and `npm run test` has zero external dependencies today; a DB-hitting test file would silently require Docker/Supabase to be running for anyone who runs `npm run test` going forward. Tracked as `docs/TODOS.md` #2 for reconsideration once CI exists.

**Known gaps, flagged rather than silently accepted:**
- `payout_accounts.profile_id` has no unique constraint — `docs/TODOS.md` #1.
- No persisted Postgres-integration test suite — `docs/TODOS.md` #2.

**Next prompt should build:** disputes (§10 Epic D5) — `raiseDispute`, the 7-day window, freezing payout creation for a disputed order, and holding any `payouts` row that's already `queued` (§8.4 HARD RULE: "a payout row is never created for a disputed order until resolution"; §10 Epic D5 AC3: "if a payout row exists and is `queued`, it is held and flagged"). The cron auto-transitions already correctly skip `disputed` orders (verified live in Prompt 15) — this is about building the path that gets an order *into* that status, and deciding how an already-`queued` payout gets "held" given `payouts.status` today only has `queued`/`paid`/`failed` (no `held` value yet — a genuine design decision for that prompt, not resolved here).

See `docs/DECISIONS.md` #67–#70 for this prompt's design choices.

Committed as `7ab67bb`, pushed to `origin/main`.

---

## Prompt 17 — Dispute flow (Epic D5 AC1-AC7)

**Note on process:** routed through `/plan-eng-review` before any code was written, per your explicit request, given this is money-adjacent (holding a queued payout) and touches the atomic order-lifecycle RPCs from Prompts 15/16. Four architecture decisions were surfaced and resolved via AskUserQuestion; an independent outside-voice pass (Claude subagent — Codex CLI not installed) then caught two real implementation bugs before they shipped — a hardcoded `interval '7 days'` directly in SQL (violating this codebase's own established "no hardcoded time windows" convention) and an `authorizeOrderAction()` helper signature that would have silently dropped analytics columns during a "zero behavior change" refactor — and disproved the review's own "race window" justification for the new `held` payout status, which was kept anyway, reframed as a HARD-RULE safety net rather than a live race defense. Full design doc + review report: `~/.gstack/projects/slinkiest-web-URS2CASH/bon-main-design-20260730-195138.md`.

**Completed:**
- Migration `supabase/migrations/20260731100000_dispute_flow.sql`: `payouts_status_enum` gains `held` (`queued`/`held`/`paid`/`failed`); `disputes_insert_participant` (Prompt 5) dropped and replaced with `disputes_insert_buyer_only` (`raised_by = auth.uid() AND o.buyer_id = auth.uid()` — the original allowed either party, a real gap this prompt closed); `raise_dispute()` — atomic, same shape as `mark_order_shipped`/`confirm_order_delivered`/`release_order`, `EXECUTE` revoked from every role but `service_role`. Takes `p_window_days` as a parameter (sourced from the new `DISPUTE_WINDOW_DAYS = 7` in `timing-config.ts`), never a hardcoded interval. `WHERE buyer_id = ... AND status IN ('paid','shipped','delivered') AND (delivered_at IS NULL OR now() <= delivered_at + N days)` is the actual guard — this alone implements AC1's "whichever is first" as an emergent property, since an already-released order is no longer in the allowed status set. Writes an `order_status_transitions` row (pre-image `status` captured via a `SELECT` before the `UPDATE` overwrites it, since `UPDATE ... RETURNING` only returns the new row). Also does `UPDATE payouts SET status='held' WHERE order_id=... AND status='queued'` in the same transaction — kept per Decision #71 as a HARD-RULE safety net even though provably unreachable under today's state machine.
- `src/lib/orders/authorize-order-action.ts` (new): `authorizeOrderAction()` — the shared guard `markShipped`/`confirmDelivery`/`releaseOrder`/`raiseDispute` all now use (fetch order, check actor field, check status, return the typed row). Extracted this prompt after `raiseDispute` became the 4th action with the identical inline shape; the 3 existing actions were refactored onto it as a pure refactor (re-verified live and via the existing test suite — zero behavior change).
- `src/lib/orders/dispute-schema.ts` (new): `disputeInputSchema` — the exact 7-value reason enum (mirroring the DB `disputes_reason_enum` CHECK, Prompt 5), 20-1000 char `detail`, up to 6 `evidenceUrls` each checked against `isAllowedImageUrl` (Decision #66 — the same crash-prevention guard listing photos use). 11 new unit tests (`dispute-schema.test.ts`).
- `src/lib/actions/disputes.ts` (new): `raiseDispute(input: DisputeInput): Result<{ disputeId }>` — auth + Zod validation + `authorizeOrderAction` (buyer-only, `paid`/`shipped`/`delivered`) + the `raise_dispute` RPC + `track("order_disputed", { order_id, dispute_reason })` (the event was already fully defined in `analytics/events.ts` — nothing to add there, confirmed before writing this file). `resolveDispute(disputeId, outcome, notes): Result<void>` — signature-correct stub per PRD §11.2, returns `not_implemented`; Prompt 19 fills in the real admin resolution logic.
- `database.types.ts` regenerated via the real Supabase CLI — `raise_dispute` RPC and the widened `payouts.status`/`disputes` types all present.

**Verified live, against local Postgres, before writing this entry:**
- Raising a dispute on a `delivered` order with an existing `queued` payout (hand-seeded, since a real payout can't naturally coexist with a disputable order per Decision #71's own reasoning) sets the order to `disputed`, `disputed_at`, and flips the payout to `held`.
- `shipping_cost_dispute` is selectable and accepted as a reason (§8.4's mandated reason code).
- A dispute raised on a still-`shipped` order (no `delivered_at` yet) succeeds with no time-window rejection — confirming a still-paid/shipped order has no cutoff from AC1.
- Once an order is `disputed`, the cron's own `eligibleShipped`/`eligibleDelivered` queries (unchanged) no longer match it — re-confirmed directly against the query shape, not just by inspection.
- A `released` order rejects a dispute attempt outright (0 rows returned, status unchanged) — AC7.
- A seller attempting to raise a dispute (wrong actor) is rejected by `raise_dispute()`'s own guard, **and separately** a seller attempting a *direct* client-side insert (bypassing the server action entirely, simulated via `SET ROLE authenticated` + `request.jwt.claim.sub`) is rejected by the narrowed RLS policy — both layers verified independently, not just the app-level one.
- A dispute raised on a `delivered` order 8 days past `delivered_at` (past the 7-day window) is rejected.
- All hand-seeded fixtures (2 `auth.users`/`profiles`, 1 category, 5 listings, 5 orders, 1 `payout_accounts`, 1 hand-forced `payouts` row) cleaned up after verification — confirmed zero leftover rows.

**Also verified:** `npx tsc --noEmit`, scoped `npx eslint "src/**/*.{ts,tsx}"`, `npx vitest run` (147/147 — 136 unchanged + 11 new `dispute-schema.test.ts`), `npm run build` all clean.

**Known gaps, flagged rather than silently accepted:**
- `resolveDispute`'s real logic (transition to `released`/`refunded`, payout creation/refund, `dispute_upheld_count`) is Prompt 19's scope — only the signature-correct stub ships now.
- `held` → `queued` (un-holding a payout after a dispute resolves for the seller) is also Prompt 19's job.
- `cancelOrder` (§10 Epic D3 AC6, a real PRD action) remains unbuilt — not named in this prompt's task, stays a known gap.

**Next prompt should build:** ratings (§10 Epic D6) — `submitRating`, per this prompt's own context handoff. `src/lib/moderation/contact-detector.ts` already has a documented TODO specifying exactly how to wire review-text scanning once this action exists.

See `docs/DECISIONS.md` #71–#74 for this prompt's design choices.

Committed as `d62ecbd`, pushed to `origin/main`.

---

## Prompt 18 — Ratings (Epic D6, every AC)

**Note on process:** the user was asked whether this prompt should go through `/plan-eng-review` like Prompts 16/17 (money-adjacent); declined, since this task touches no payout/order-lifecycle-RPC state and the PRD already dictates the mechanism (UNIQUE constraint + catch, no update/delete, immutable). Implemented directly with the same live-verification rigor.

**Completed:**
- Migration `supabase/migrations/20260801090000_ratings_action.sql`: adds `orders.rating_reminder_sent_at timestamptz` — the only schema change needed, since `ratings`, its RLS (buyer-insert-on-concluded-order only, Prompt 5), `ratings_public`, and `recompute_seller_rating` (rating_count/average trigger, NULL below 3, Prompt 6) already existed and needed no changes.
- `src/lib/ratings/submit-rating-schema.ts` + 10 tests: `score` 1-5 integer, `review` optional (empty string normalized to `undefined`), max 500 chars.
- `src/lib/actions/ratings.ts`: `submitRating({ orderId, score, review }): Result<{ ratingId }>` — buyer-only, `released`/`refunded` only (AC1/AC11), app-level pre-checks for a clear error message backed by the real enforcement layer: `ratings_insert_buyer_on_concluded_order` RLS (the insert goes through the buyer's own session client, not service-role — the opposite posture from every order-lifecycle action, since `ratings`' RLS is the actual gate here, Decision #76). One rating per order via the `order_id` UNIQUE constraint, caught as Postgres `23505`, never a pre-check (AC3/AC12). Review text scanned via the existing `scanForContactDetails`/`flagContactDetection` (Prompt 9) — `moderation_flags.listing_id` resolved via the rated order's own `listing_id` → `listings.category_id` → `categories.slug` (Decision #77, since a rating has no listing_id of its own). Fires `rating_submitted` with `score`/`has_review`/`days_since_released` (computed from `released_at ?? refunded_at`).
- **A real bug caught by live verification, not inspection** (Decision #75): the first version used `.insert(row).select("id").single()`, matching every other action's pattern — but `ratings` has zero SELECT policy for `authenticated` at all (Decision #24), and Supabase's insert-then-select issues an `INSERT ... RETURNING`, which itself needs a passing SELECT policy on the new row. Confirmed live: the identical insert succeeds without `.select()`, fails with an RLS violation the instant one's added. Fixed by generating the rating's `id` client-side (`crypto.randomUUID()`, same pattern already used in `listing-form.tsx`/`upload-listing-photo.ts`) and inserting without any read-back.
- `RatingPromptForm` (new client component, `src/components/order/rating-prompt-form.tsx`): score 1-5 buttons + optional review textarea, fires `rating_prompt_shown` on mount. Wired into `src/app/(buyer)/orders/[id]/page.tsx` — renders only when `isBuyer && status IN ('released','refunded') && !hasRating`, never on pending/paid/shipped (AC1), never once already rated (immutable, no edit path). `getOrderDetail` extended with `hasRating` (via `ratings_public`, since the base table can't be self-read) and `refundedAt`.
- `/api/cron/rating-reminders` (new, same shape as `expire-pending-orders`/`auto-release-orders`): finds `released`/`refunded` orders ≥72 hours old (`RATING_REMINDER_HOURS`, `timing-config.ts`) with no rating and no reminder sent yet, fires `rating_prompt_shown`, stamps `rating_reminder_sent_at` (AC10 — "one reminder... no further reminders"). This was a genuine scope fork flagged before building (not in this prompt's own VERIFICATION list) — see Decision #78.
- Reviews on listing detail/seller profile (Prompts 11/12) already render non-hidden only via `ratings_public` + `is_hidden = false` (Decision #53) — confirmed, no changes needed.
- `database.types.ts` regenerated via the real Supabase CLI.

**Verified live, against local Postgres (and a real HTTP request to the dev server for the cron route), before writing this entry:**
- Rating a `shipped` order as the buyer, simulated via `SET ROLE authenticated` + `request.jwt.claim.sub`: rejected by RLS.
- Rating a `released` order: succeeds (after the id-generation fix above).
- A second rating attempt on the same order: fails with Postgres `23505` (unique_violation) on `ratings_order_id_key`, not a pre-check — the actual `INSERT` was attempted, no `SELECT` against `ratings` ran first.
- Rating a `refunded` order (AC11): succeeds.
- A review containing a phone number (`"Call 0803 123 4567..."`): the rating publishes, `scanForContactDetails` correctly detects it, and — verified by directly invoking the real `flagContactDetection` module via `tsx` (not a re-implementation) — a `moderation_flags` row is created with the correctly-derived `listing_id`, `source: auto_contact_detect`, `pattern_type: phone`, `matched_text`, and `contact_detail_flagged` fires.
- No `updateRating`/`deleteRating` exists anywhere (grepped; the only match is this prompt's own comment documenting the absence).
- The rating-reminders cron, hit via real HTTP with the correct `CRON_SECRET`: finds an eligible unrated order (released 80h ago) and stamps `rating_reminder_sent_at`; a second run finds nothing left to do (`remindersSent: 0`); a separately-seeded eligible-but-already-rated order is correctly excluded and its column stays unstamped; the wrong secret gets a 401.
- All hand-seeded fixtures (2 `auth.users`/`profiles`, 1 category, 5 listings, 5 orders, 2 ratings, 1 moderation_flags row) cleaned up after verification — confirmed zero leftover rows.

**Also verified:** `npx tsc --noEmit`, scoped `npx eslint "src/**/*.{ts,tsx}"`, `npx vitest run` (157/157 — 147 unchanged + 10 new `submit-rating-schema.test.ts`), `npm run build` all clean.

**Known gaps, flagged rather than silently accepted:**
- The actual rating-prompt email and its 72-hour reminder email are Prompt 22's scope — this prompt built the real call sites (both events fire correctly, the reminder's "exactly once" invariant is enforced at the data layer) but no email is actually sent yet, same deferral as every other order_* notification.
- The buyer's orders list page (`/orders`) shows no "needs rating" indicator — only the order-detail page surfaces the prompt, matching how every other buyer/seller action (markShipped, confirmDelivery, releaseOrder) is also detail-page-only, not list-page.

**Next prompt should build:** the admin moderation surface (§10 Epic E) — the `moderation_flags` queue, listing/seller suspension, dispute resolution (`resolveDispute`'s real logic, stubbed in Prompt 17), and `hideReview` (AC8: sets `is_hidden` only, never touches `score`/`rating_average`/`rating_count`). Needs the admin-role mechanism (Known Issue #12) built first — nothing in Epic E has anywhere to check "is this caller actually an admin" yet.

See `docs/DECISIONS.md` #75–#78 for this prompt's design choices.

Committed as `fe65ba4`, pushed to `origin/main`. `docs/PROJECT_STATUS.md` reflects the full state as of this prompt — read it first in a fresh session before starting Prompt 19.

---

## Prompt 19 — Admin moderation surface (Epic E1/E2/E5; E3/E4 deferred)

**Note on scope:** the task brief itself scoped this prompt to admin access
(E5), the moderation queue (E1), suspend seller/listing-limit-override
(§5.4/§11.2), `resolveDispute`'s real logic (E2), and `hideReview` — E3
(payout queue) and E4 (category control) were explicitly out, next prompt.
Two citation-drift items resolved without blocking (same pattern as
Decisions #21/#26/#35/#54 before this): "Gadgets auto-flag cases from 6.4"
doesn't correspond to anything in §6.4.3 — its HARD RULEs are all
submission-time Zod rejections, not a post-publish flag mechanism (Decision
#84); "emits `dispute_resolved`" isn't in §3.5's event table — resolution
fires `order_released`/`order_refunded` instead, the events that already
exist for these exact transitions (Decision #83).

**Completed:**
- Migration `supabase/migrations/20260801100000_admin_role_and_moderation.sql`:
  - `profiles.is_admin boolean not null default false` — the entire admin-role
    mechanism (§10 Epic E5 AC2), nothing more elaborate (Decision #79).
  - `listings.suspension_reason`/`suspended_at`/`suspended_by` and
    `profiles.suspension_reason`/`suspended_at`/`suspended_by` — audit columns
    so `suspendListing`/`suspendSeller`'s `reason` argument isn't silently
    discarded; §5.4's own HARD RULE requires the listing reason specifically
    be retrievable ("remain visible to her with the reason").
  - **A real, pre-existing security gap found and closed in the same
    migration, not a new one introduced by it** (Decision #81):
    `profiles_update_own`/`listings_update_own` (Prompts 2/4) had no
    column-level protection at all — RLS is row-level, and nothing stopped
    an authenticated user from directly `PATCH`-ing her own `is_admin`,
    `is_suspended`, `listing_limit_override`, or (for listings)
    `status`/the new suspension columns via the client SDK, bypassing every
    server action. Two new `BEFORE UPDATE` triggers
    (`prevent_profile_self_service_admin_fields`,
    `prevent_listing_self_service_suspension`) close this, distinguishing a
    real user session (`auth.uid() is not null`) from the service role
    (`auth.uid() is null`, every admin action, always) — same reasoning
    Decision #28 already established for `recompute_seller_rating`.
  - `order_status_transitions_actor_role_enum` widened to include `'admin'`
    — the first admin-driven order transition.
  - `admin_suspend_listing(listing_id, admin_id, reason)` — atomic: sets the
    listing suspended with its reason, closes any open `moderation_flags`
    rows for it (`reviewed_by`/`reviewed_at`, AC5), works whether or not the
    listing was ever flagged (AC4).
  - `resolve_dispute_release`/`resolve_dispute_refund(dispute_id, admin_id, notes)`
    — atomic `disputed -> released`/`disputed -> refunded` transitions,
    `order_status_transitions`-recorded, `admin_notes`/`resolved_by`/
    `resolved_at` on the dispute row. The release path duplicates (doesn't
    call) `release_order`'s payout-creation block, since that function's own
    `WHERE status = 'delivered'` guard can't fire from `disputed` (Decision
    #85). The refund path creates no payout row — structurally true with no
    guard code, since a disputed order can never have held one.
  - All three new functions: `EXECUTE` revoked from `public`/`anon`/
    `authenticated`, granted only to `service_role`, same shape as every
    prior order-transition RPC.
- `src/lib/admin/require-admin.ts`: `requireAdmin()` — the one reusable
  check (§11.2 HARD RULE), re-queries `profiles.is_admin` via the
  service-role client on every call, never trusts the session or the
  middleware's own decision.
- `scripts/promote-admin.ts` + `npm run admin:promote -- <email>`: the only
  way to grant admin, ever (Decision #80) — no server action, no UI, no
  public route can do this. Requires the service-role key, looks the user
  up by email, shows who's about to be promoted, requires typing `yes`.
  README documents running it against a real deployment.
- `src/lib/actions/admin.ts`: `suspendListing`, `suspendSeller`,
  `setListingLimitOverride`, `hideReview`, `dismissFlag` — every one calls
  `requireAdmin()` first, unconditionally. `hideReview`'s DB write touches
  `is_hidden` only, literally (Decision #87) — the `reason` is validated and
  logged, never persisted on `ratings`.
- `src/lib/actions/disputes.ts`: `resolveDispute` — fills Prompt 17's stub.
  Buyer path calls `refundTransaction()` (new, `src/lib/paystack/index.ts`,
  a real `/refund` API call, same "build it for real" posture as
  `initializeTransaction`) **before** touching any DB state — the mirror of
  `initiateCheckout`'s own provisional-row-then-rollback sequencing
  (Decision #86). Seller path calls `resolve_dispute_release` and reuses
  `trackOrderReleased` (the same helper the buyer/cron release path uses).
- `src/middleware.ts`: `/admin` handling split out from the generic
  `PROTECTED_PREFIXES` redirect — queries `profiles.is_admin` for the
  current user (if any) and, on failure, `NextResponse.rewrite()`s to a
  guaranteed-unmatched path so Next's own not-found boundary renders a
  genuine 404, indistinguishable from any other broken link (Decision #88).
  Every other protected prefix still redirects to `/sign-in` as before — the
  AC1-required *different* failure mode is scoped to `/admin` only.
- `src/app/admin/`: `layout.tsx` (a second, redundant-by-design
  `requireAdmin()` check — defense in depth, not the real boundary),
  `page.tsx` (counts), `moderation/page.tsx` (open flags newest-first +
  "all recent listings" browse for AC4's "whether or not flagged"),
  `disputes/page.tsx` + `disputes/[id]/page.tsx` (full order/listing/both
  parties/evidence + resolve form), `reviews/page.tsx` (hideReview surface),
  `sellers/page.tsx` (handle-search + suspend/limit-override forms). All
  Server Components reading via new `src/lib/admin/get-*.ts` query modules
  (service-role client — every one of these tables is admin-only or has no
  blanket SELECT policy); small `"use client"` leaf components for the
  actions themselves, matching every prior prompt's established shape
  (`mark-shipped-form.tsx` etc.). `robots: noindex` on the layout — "no
  SEO" per this prompt's brief.
- `ACTOR_LABELS` in `/orders/[id]/page.tsx` gained `admin: "Admin"` so an
  admin-resolved dispute's transition renders correctly in a buyer/seller's
  own order history.

**Verified live, against local Postgres, via a 31-check `tsx` script (not
just typecheck/lint) before writing this entry:**
- **Self-service lockdown (the real gap this prompt closed):** an
  authenticated non-admin session's direct client-side
  `.update({is_admin: true})`/`.update({is_suspended: true})`/
  `.update({listing_limit_override: 99999})` on her own profile row all
  silently no-op; her direct `.update({status: 'published'})` on her own
  already-suspended listing silently no-ops. An ordinary self-edit (`bio`,
  or a non-suspended listing's `description`) still succeeds — the trigger
  is scoped correctly, not a blanket lock.
- `requireAdmin()`'s underlying query resolves `false` for a non-admin and
  `true` for a freshly-granted admin.
- `admin_suspend_listing`: sets `status='suspended'` + the reason, closes an
  open flag on that listing with `reviewed_by`/`reviewed_at` set.
- A suspended listing: `anon` client gets `null` (public 404); the owner's
  own session still reads it, with the reason (§5.4's exact requirement).
- `resolve_dispute_release`: transitions the order to `released`, creates a
  payout row for the correct amount referencing the seller's verified
  account, writes an `order_status_transitions` row with `actor_role='admin'`,
  and — via the pre-existing Prompt 6 trigger, unmodified — increments
  `completed_sales_count`.
- `resolve_dispute_refund`: transitions to `refunded`, creates **no** payout
  row, and — via the pre-existing trigger — increments
  `dispute_upheld_count`.
- Re-resolving an already-resolved dispute is a no-op (empty RPC result),
  not a double-apply.
- HTTP-level, against a real `npm run dev` instance: unauthenticated
  `/admin` and `/admin/moderation` both return a genuine `404` (not a
  redirect), while `/dashboard/listings` still `307`s to `/sign-in` — the
  deliberately different failure mode AC1 requires. Confirmed via `diff`
  that the `/admin` 404 body matches a request to a truly nonexistent path.

**Not live-verified this session (flagged, not silently skipped — Known
Issue #37):** the signed-in-*non-admin* HTTP path specifically — replicating
`@supabase/ssr`'s cookie format by hand in `curl` wasn't practical, and
gstack's `browse` tool was unavailable in this environment (`bun` not
installed). The code path is shared with the already-live-verified
unauthenticated branch (one `if (user) { query is_admin }` conditional, not
a separate implementation), so this is a low-risk gap, not an unverified
core mechanism.

**Also verified:** `npx tsc --noEmit`, scoped `npx eslint "src/**/*.{ts,tsx}" "scripts/**/*.ts"`, `npx vitest run` (157/157, unchanged — this prompt added no new pure-function modules), `npm run build` all clean (`/admin` + its 5 sub-routes all registered). All test fixtures (4 `auth.users`/`profiles`, listings, orders, disputes, a payout, a moderation flag) cleaned up via a final `supabase db reset`, leaving a clean seeded local DB for the next session.

**Known gaps, flagged rather than silently accepted:**
- No `unsuspendListing`/`reinstateSeller` exists anywhere — same "absence is
  deliberate, don't add it" posture §11.2 already states explicitly for
  `updateRating`/`deleteRating`, but genuinely worth an explicit sign-off
  before this ships, since a wrongly suspended listing/seller currently has
  no undo path short of a raw database write. Known Issue #35.
- `suspendSeller` doesn't cascade to the seller's existing `published`
  listings — two independent §11.2 actions, no AC ties them together
  (Decision #82). Known Issue #36.
- The signed-in-non-admin middleware path (above). Known Issue #37.
- Admin/moderator email notifications (AC3's seller-suspension email, AC5's
  both-parties-emailed-on-resolution) are call-site-only, same Prompt-22
  deferral as every other notification in this codebase.

**Next prompt should build:** the admin payout queue (§10 Epic E3) — lists
`queued` payouts with seller/masked account/amount/days-since-release,
flags unblocked-vs-blocked (the `payouts.is_blocked` column Prompt 16
already built), `markPayoutPaid`/`markPayoutFailed` (both requiring
`admin_reference`/`failure_note` respectively, both going through
`requireAdmin()` — the mechanism this prompt built, ready to reuse
unchanged). Category control (§10 Epic E4) is the only other remaining Epic
E surface with zero code.

See `docs/DECISIONS.md` #79–#88 for this prompt's design choices.

---

## Prompt 20 — Admin payout queue (Epic E3)

**Note on citation drift, resolved before writing code (same posture as
Decisions #21/#26/#35/#54/#83/#84 before this):** the task brief said
`markPayoutPaid` "sets completed" and transitions the constituent orders
to a `paid_out` status, and that the action "emits `payout_completed`."
None of the three exist anywhere in the PRD — `payouts.status`'s real enum
is `queued`/`held`/`paid`/`failed` (§10 Epic E3 AC3 literally says "Sets
`paid`, `paid_at`, `paid_by`"), §8.1's order state machine is a closed
9-value set with no `paid_out` and no transition after `released` at all,
and §3.5's event table has `payout_marked_paid` (already scaffolded since
Prompt 19), not `payout_completed`. Built against the real PRD text — see
Decisions #89/#90.

**Completed:**
- Migration `supabase/migrations/20260802090000_payout_queue.sql`:
  - Replaces `payouts.order_id`'s blanket `UNIQUE` with
    `payouts_order_id_active_unique`, a partial unique index excluding
    `status = 'failed'` — the DB-level enforcement of this prompt's HARD
    RULE #4 ("a single order can never appear in two non-failed payouts").
    The rule's own "non-failed" phrasing is the textual signal that failed
    attempts are meant to persist as their own rows rather than being
    reused (Decision #91) — same shape as `orders_listing_id_active_unique`
    (Decision #54).
  - `mark_payout_paid(payout_id, admin_id, reference)` — atomic,
    `WHERE status = 'queued' AND is_blocked = false` (AC2's "not
    actionable" enforced at the DB level too, not just the UI's disabled
    state).
  - `mark_payout_failed(payout_id, note)` — sets the failing row to
    `status='failed'` permanently (kept as history, `failure_note` intact)
    and, in the same transaction, inserts a fresh `queued` row for the same
    order, re-resolving `payout_account_id`/`is_blocked` from scratch
    (Decision #92) — not a blind copy of the failed row's stale values.
    No `admin_id` parameter: `payouts` has no "who marked this failed"
    column (only `paid_by`), so the actor is logged at the TypeScript layer
    only, same posture as `hideReview`'s reason (Decision #87).
  - Both functions: `EXECUTE` revoked from `public`/`anon`/`authenticated`,
    granted only to `service_role`, same shape as every prior admin RPC.
- `src/lib/admin/get-payouts.ts`: `getPayoutQueue()` — scoped to
  `status = 'queued'` only (AC1's literal word; `held`/"processing" are
  both out of scope, Decision #93), grouped by seller with a masked bank
  account (`Bank Name ••••1234`, one per seller group — Decision #94),
  per-seller and grand (`totalOutstandingKobo`, AC7) totals, and
  `daysSinceReleased` computed from each constituent order's `released_at`.
- `src/lib/admin/admin-schemas.ts`: `markPayoutPaidInputSchema`
  (`reference`, min 3 chars — AC3's "requires `admin_reference`"),
  `markPayoutFailedInputSchema` (`note`, min 5 chars — AC4's "requires
  `failure_note`").
- `src/lib/actions/admin.ts`: `markPayoutPaid`/`markPayoutFailed` — both
  call `requireAdmin()` first, unconditionally, same as every existing
  admin action. `markPayoutPaid` fires `payout_marked_paid` with
  `hours_since_released` computed from the order's `released_at` (not the
  payout row's own `created_at`); no order-side write happens anywhere in
  either action (Decision #89 — payout completion is a `payouts`-table-only
  event). AC6 (seller emailed on paid) is a call site only, same
  Prompt-22 deferral as every prior notification in this codebase.
- `src/app/admin/payouts/page.tsx` + `MarkPayoutPaidForm`/
  `MarkPayoutFailedForm` (new client components, same
  useTransition/router.refresh() shape as every prior admin action form):
  seller groups, masked account, per-row amount/days-since-release/blocked
  badge, mark-paid (disabled with a "Blocked" label when `is_blocked`) and
  mark-failed actions. Nav link added to `src/app/admin/layout.tsx`; a
  "Payouts outstanding" tile added to `/admin`'s landing page alongside the
  existing open-flags/open-disputes tiles.

**Verified live, against local Postgres, via a 21-check `tsx` script (not
just typecheck/lint) before writing this entry:**
- Grouping/totals: two queued payouts for seller A and one (blocked) for
  seller B group correctly, seller A's subtotal and the grand
  `totalOutstandingKobo` both sum exactly right, seller B's payout is
  correctly flagged `is_blocked`.
- **The DB-enforced double-payout guard (HARD RULE #4), the core thing
  this prompt had to get right:** inserting a second `queued` payout for
  an order that already has one is rejected with Postgres `23505`; after
  `mark_payout_failed` moves the original to `failed`, a fresh `queued`
  row for the *same* order inserts successfully (the retry); a third
  non-failed row for that same order is rejected again — exactly "at most
  one non-failed row per order, at any time."
- `mark_payout_paid`: succeeds on a queued/unblocked payout, sets
  `status`/`paid_at`/`paid_by`/`admin_reference` correctly; the
  constituent order's `status` is confirmed **unchanged** (still
  `released`) immediately after — direct confirmation that Decision #89's
  "no order-side effect" reading is what actually happens, not just what
  was intended. Re-marking an already-paid payout is a no-op (empty RPC
  result). Attempting to mark a **blocked** payout paid is rejected (empty
  RPC result) — AC2's "not actionable" enforced at the DB level.
- `mark_payout_failed`: the original row ends at `status='failed'` with
  `failure_note` set; exactly 2 rows now exist for that order (the failed
  original + a fresh `queued` retry); the retry row correctly re-resolved
  seller A's verified account and carries the right amount.

**Also verified:** `npx tsc --noEmit`, scoped `npx eslint "src/**/*.{ts,tsx}" "scripts/**/*.ts"`, `npx vitest run` (157/157, unchanged — this prompt added no new pure-function modules), `npm run build` all clean (`/admin/payouts` registered). All test fixtures (4 `auth.users`/`profiles`, 1 payout account, 3 listings, 3 orders, 3+ payout rows) cleaned up via a final `supabase db reset`.

**Known gaps, flagged rather than silently accepted:**
- `payout_accounts.profile_id` has no uniqueness constraint (pre-existing,
  `docs/TODOS.md` #1) — now has a sharper consequence for retries
  specifically. Known Issue #38.
- No admin order-detail page exists to link a payout row's `order_id` to;
  shown as plain text. Not asked for by this prompt's ACs. Known Issue #39.

**Next prompt should build:** Epic E4 (category control) — `setCategoryFlags`,
the `listable`/`browsable` toggle UI, per-category live published-listing
count/distinct-seller-count/listing-to-sale-conversion (AC2), and the
success-metrics view (second-listing-rate, the project's primary metric,
per §3.1/§3.4). `setCategoryFlags` should reuse `requireAdmin()` unchanged,
same as every action Prompts 19/20 already built.

See `docs/DECISIONS.md` #89–#94 for this prompt's design choices.

---

## Prompt 21 — Category flags + metrics dashboard (Epic E4, §3 success framework)

**Note on citation drift, resolved before writing any code (same posture
as every prior prompt's citation-drift decisions):** the task brief cited
"section 2" for the success framework, "2.5"/"2.6" for events/the
browsable threshold, "section 4" for independent listable/browsable flags,
and labelled the two ACs "US-13"/"US-14." None of those match the PRD's
real structure — the success framework is §3 (§3.1 primary metric, §3.2
supporting metrics, §3.4 kill/expand, §3.5 events), independent flags are
§6.2, and "US-13"/"US-14" don't exist anywhere (grepped). The brief's
"buyer repeat rate within 60 days" also contradicts §3.2's own literal
"(30 day)," and its 9-metric bullet list dropped payout latency (a real
§3.2 metric) in favor of listing abandonment rate (not one of §3.2's 8
named metrics, though grounded in §3.4.1's diagnostic text) — built both,
not a swap, per this prompt's own "do not invent or omit" HARD RULE. See
Decisions #95–#101.

**Completed:**
- Migration `supabase/migrations/20260803090000_admin_metrics.sql`: 9 SQL
  functions computing every §3 metric directly from `listings`/`orders`/
  `disputes`/`moderation_flags`/`payouts` — there is no queryable event
  stream to compute from yet (`track()` is still a `console.log` stub,
  Decision #97): `metric_second_listing_rate` (§3.1, the primary metric),
  `metric_median_time_to_second_listing`,
  `metric_listing_to_sale_conversion_by_category`,
  `metric_median_time_to_first_sale_by_category`,
  `metric_weekly_seller_cohort_retention`, `metric_buyer_repeat_rate_30d`
  (30 days, not the brief's 60 — Decision #96), `metric_dispute_rate`,
  `metric_leakage_signal_rate` (scoped to `source = 'auto_contact_detect'`
  only — Decision #101, Known Issue #40), `metric_listing_abandonment_rate`
  (a DB-derived proxy — Decision #98, Known Issue #41), and
  `metric_payout_latency_hours` (Decision #99). Every "within N days"
  metric applies the same unbiased-cohort treatment: only subjects whose
  full window has already elapsed are counted at all (Decision #100). All
  `EXECUTE`-revoked from `public`/`anon`/`authenticated`, granted only to
  `service_role`.
- `src/lib/admin/get-category-overview.ts`: `getCategoryOverview()` — every
  category with live published listing count, distinct seller count (no
  30-day restriction — §6.2's "live" count), and 30-day listing-to-sale
  conversion (reusing the same SQL function the metrics dashboard also
  calls, one definition, two call sites), plus the §3.4 browsable-gate
  thresholds (30 listings / 10 sellers / 15% conversion) exported as named
  constants for both the guidance-text copy and a `meetsBrowsableGate`
  flag.
- `src/lib/admin/get-metrics.ts`: `getMetricsSnapshot()` — wraps all 9 SQL
  functions plus a diagnostic-context query (total sellers who've ever
  published, weeks since the earliest published listing) for §3.4.1's own
  "evaluate at 8+ weeks, 50+ sellers" gate.
- `src/lib/actions/admin.ts`: `setCategoryFlags(categoryId, { listable?,
  browsable? })` — `requireAdmin()` first, like every admin action.
  `listable`/`browsable` are independently settable (§6.2 HARD RULE); the
  category's *current* `browsable` value is read before the update so
  `category_enabled` fires only on a genuine false→true transition, never
  on a `listable`-only change or a no-op true→true call (Decision #102),
  with `listing_count_at_flip` queried fresh at the moment of the decision
  and `category_id` set to the registry slug (matching every other event's
  convention, not the DB UUID).
- `src/app/admin/categories/page.tsx` + `CategoryFlagsForm` (new client
  component, two independent checkboxes, a confirm() specifically on
  flipping browsable to true): the category flags screen, AC1/AC2/AC3.
- `src/app/admin/metrics/page.tsx`: the metrics dashboard — the primary
  metric with its 40%-target/20%-kill-threshold context, all 8 supporting
  metrics (including payout latency), the two by-category tables (conversion,
  time-to-first-sale), the weekly cohort retention grid (incomplete future
  weeks rendered as "—", not a misleading 0%), and the §3.4.1 diagnostic
  matrix — rendered as PRD-literal prose in each of its 4 defined cells,
  the current reading highlighted only when it maps unambiguously onto one
  of them and the "reliable reading" gate (8+ weeks, 50+ sellers) is met; a
  Beauty conversion strictly between 20% and 40% is explicitly shown as
  falling outside both defined columns, not force-fit into either. A
  display aid only — nothing here writes anything.
- Nav links (`Categories`, `Metrics`) added to `src/app/admin/layout.tsx`.

**Verified live, against local Postgres, via a 20-check `tsx` script with
hand-constructed fixtures spanning multiple sellers/buyers/categories with
known, hand-computed expected values (not just "did it run without
erroring") before writing this entry:**
- `second_listing_rate`: correctly excludes a seller whose first listing
  is only 5 days old (not yet cohort-eligible) from the denominator
  entirely; correctly counts exactly 1 of 3 eligible sellers reaching a
  second listing (33.3%).
- `median_time_to_second_listing`: exactly 9 days for the one seller with
  a real gap between her first and second listing.
- `listing_to_sale_conversion_by_category`: exactly 4 eligible beauty
  listings, exactly 2 converted (50%), matching the hand-built fixture
  precisely (2 sold, 2 not).
- `median_time_to_first_sale_by_category`: exactly 15 days (the median of
  two sellers' 5-day and 25-day gaps).
- `buyer_repeat_rate_30d`: a buyer whose second release lands 15 days
  after her first (within 30) is correctly counted as a repeat (100% of 1
  eligible buyer).
- `dispute_rate`: exactly 1 of 2 paid orders disputed (50%).
- `leakage_signal_rate`/`listing_abandonment_rate`/`payout_latency_hours`:
  each matches its fixture exactly (the latter down to an exact 48-hour
  gap between a hand-set `released_at` and `paid_at`).
- **The single most important thing this prompt needed to prove live: a
  `browsable` toggle takes effect on the very next request, with no server
  restart in between.** Against a real running `npm run dev` instance:
  `/c/fashion` with `browsable = false` → `404`; flipped `true` via direct
  DB update (simulating `setCategoryFlags`'s own write) → the *same*
  running server now returns `200` for `/c/fashion` with no restart;
  flipped back to `false` → `404` again. Confirms §6.2/AC3's "takes effect
  without a deploy" isn't just true by architectural inspection (no
  caching layer exists) but actually observed.

**Also verified:** `npx tsc --noEmit`, scoped `npx eslint "src/**/*.{ts,tsx}" "scripts/**/*.ts"`, `npx vitest run` (157/157, unchanged — this prompt added no new pure-function modules), `npm run build` all clean (`/admin/categories` + `/admin/metrics` registered). All fixtures cleaned up via a final `supabase db reset`.

**Known gaps, flagged rather than silently accepted:**
- Leakage signal rate undercounts §3.2's own definition — "admin flagged
  leakage cases" aren't isolable from other admin moderation reasons in
  the current schema. Known Issue #40.
- Listing abandonment rate is a proxy, not the literal event ratio (which
  isn't persisted). Known Issue #41.
- The weekly cohort retention query hasn't been profiled at scale (fine
  for MVP volumes). Known Issue #42.
- No historical/trend view — every figure is a live point-in-time
  snapshot, not asked for, not built. Known Issue #43.

**Next prompt should build:** the real email layer (Resend + React Email,
per PRD §12.1's stack table) and consolidate `track()` from its
`console.log` stub into real PostHog calls — every order/rating/dispute/
payout/category lifecycle event already has a correctly-typed, correctly
-placed call site (Prompts 13 through 21, none skipped); this is purely
about making those calls real, not finding new places to add them. Once
that lands, revisit Decision #97/#98 — some of this prompt's DB-only
metric computations may be worth cross-checking against, or replacing
with, real event-sourced figures.

See `docs/DECISIONS.md` #95–#102 for this prompt's design choices.
