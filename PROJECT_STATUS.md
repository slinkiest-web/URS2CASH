# Urs2Cash — Project Status

**As of:** 2026-07-28
**Sources:** `docs/urs2cash-prd.md` (v2.0, locked), `docs/HANDOFF.md` (Prompts 1–8), `docs/DECISIONS.md` (#1–39), `docs/KNOWN_ISSUES.md` (#1–24), repo state at commit `9debb59`.
**Verified for this report:** `npm run typecheck` clean, `npm run test` 70/70 passing, `git status` clean on `main`.

This is a handoff snapshot, not a living doc — re-verify anything load-bearing before acting on it.

---

## 1. What this product is

A peer-to-peer recommerce marketplace for Nigeria (beauty-first, multi-category from day one). Sellers list pre-owned goods, buyers pay through escrow-lite (Paystack), funds release on delivery confirmation, platform takes 10% commission. No chat, no negotiation, no auction — the whole product bet is that a seller's *second listing* is the thing to optimize for (primary success metric: **second listing rate within 30 days**, target ≥40%, kill threshold <20% at 8 weeks/50 sellers).

Eight "prompts" (build sessions) have shipped so far, each logged in full in `docs/HANDOFF.md`. This document summarizes where that leaves the codebase.

---

## 2. Implementation state by PRD epic

| Epic | Status | Notes |
|---|---|---|
| **A — Auth & profile** | Mostly built | Email/password signup+verify (Resend via SMTP relay), sign-in/out, middleware route protection, profile edit page. **Not built:** Paystack bank-account resolution/masking (A3 AC2–AC6), AC3 email-verification gate on publish/checkout (nothing to gate yet). |
| **B1 — Create listing** | Built | `/sell`, `createListing`, category registry + 5 Zod schemas, dynamic attribute form, photo upload, tier/cap limit gate, contact-detector stub. |
| **B2 — Listing velocity** | Built | Draft autosave (localStorage), "list another" flow, most-recent-category default, multi-photo parallel upload. |
| **B3 — Price guidance** | **Not built** | No `getPriceGuidance` action, no UI. |
| **B4 — Manage listings** | Mostly built | `/dashboard/listings`, `updateListing`/`removeListing`, immutable-field enforcement, blocking-order check. **Gap:** no `view_count` (schema never added it — issue #22). |
| **C — Discovery (browse/search/detail/profile)** | **Not built** | No `(shop)` routes, no search, no listing detail page, no `/s/[handle]`. |
| **D — Purchase & escrow** | **Not built** | No checkout, no Paystack webhook route, no order state machine code (schema exists — see §3), no shipping/delivery/dispute/rating actions beyond the `ratings`/`orders`/`disputes` tables and their triggers. |
| **E — Admin** | **Not built** | No `/admin` routes, no admin server actions, no admin-role mechanism at all (see Known Issue #12 below). |

**Net:** the database schema is essentially complete for the whole PRD (all `§7.1` tables exist). The application layer covers **Epic A (partial) and Epic B (full except price guidance)**. **Epics C, D, and E have zero application code.**

---

## 3. Database schema (fully built, never executed)

Five migrations exist, all hand-written against PRD §7.1, all verified by SQL-grammar parsing (`libpg-query`) but **never run against a live Postgres instance** — Docker has been unavailable in every build session so far. This is the single largest cross-cutting risk (see §5).

| Migration | Contents |
|---|---|
| `20260727202617_profiles.sql` | `profiles`, `payout_accounts`, RLS, `profiles_public` view, `handle_new_user` trigger |
| `20260727215742_categories_listings.sql` | `categories`, `listings`, RLS, 6 indexes, `assign_seller_listing_index` / immutable-field / `updated_at` triggers, seed data (5 categories) |
| `20260728100239_orders_and_related.sql` | `orders`, `disputes`, `ratings` (+`ratings_public` view), `payouts`, `moderation_flags`, `webhook_events`, RLS |
| `20260728102304_triggers.sql` | `completed_sales_count` increment, `recompute_seller_rating`, `dispute_upheld_count` increment |
| `20260728134156_listing_photos_storage.sql` | `listing-photos` Storage bucket + RLS on `storage.objects` |

`src/lib/database.types.ts` is **hand-authored**, not CLI-generated (Docker gap), covering 10 tables + 3 views. It has grown every prompt with no verification against real generated output.

---

## 4. Key architectural decisions (see `docs/DECISIONS.md` for full reasoning)

- **Column-vs-JSONB split:** shared fields (`price_kobo`, `condition`, etc.) are real columns; category-local fields live in a Zod-validated `attributes` JSONB column. `condition` is modeled *inside* each category's Zod schema (so cross-field rules like "used requires X" can be expressed as `superRefine`), then destructured back out (`{ condition, ...attributes }`) before persisting — callers must know this split isn't automatic (Decision #9).
- **Public-column-privacy pattern, used three times:** a table with RLS that can't express "hide column X but keep column Y public" gets a dedicated `_public` view instead of a weaker base-table policy. Applied to `profiles` → `profiles_public` (hides `phone`), `ratings` → `ratings_public` (hides `review` when `is_hidden`, keeps `score`). **Not yet applied to `orders`** for buyer delivery details pre-`paid` — flagged as open (Known Issue #14).
- **`seller_listing_index`** is assigned by an advisory-lock-serialized Postgres trigger at the moment a row becomes `published` — never in application code, per HARD RULE.
- **Auth is email+password only** (no OTP, no OAuth) — PRD explicitly puts social login out of scope.
- **Registry-driven categories:** all 5 category Zod schemas resolve dynamically by slug through `src/lib/categories/registry.ts`; no `switch` on category name anywhere (a PRD HARD RULE), reinforced by `usageIndicatorFields` as registry metadata rather than hardcoded UI logic.
- **`Result<T>` convention** (`src/lib/result.ts`) is the shared shape for every server action — no throwing to the client.
- **Drafts get full Zod validation**, identical to publish — the only differences are the tier/cap check (skipped for drafts) and the `status` value (Decision #35, resolved via explicit user sign-off after two PRD HARD RULEs collided).
- **`SECURITY DEFINER`** is applied narrowly: only `recompute_seller_rating` needs it (buyer's session writing to the seller's `profiles` row); the sales-count and dispute-count triggers don't, because they only ever fire under service-role transitions that already bypass RLS.

---

## 5. Known issues (see `docs/KNOWN_ISSUES.md` for the full list of 24)

**Blocking / cross-cutting:**
1. **No migration has ever executed against a live Postgres instance.** Docker has been unavailable in every session. Every trigger, RLS policy, CHECK constraint, and view is verified only by hand-trace and SQL-grammar parsing — none by execution. This is issues #1, #2, #8, #13, #16, #17, #18 combined, and it's the first thing to close once Docker is available: run `supabase db reset`, then work through each prompt's "Not verified" list.
2. **`database.types.ts` is hand-authored**, not CLI-generated, and has been for all 5 migrations (issues #1, #10). Regenerate with `npx supabase gen types typescript --local` and diff once Docker exists — don't trust it blindly until then.
3. **No admin-role verification mechanism exists anywhere** (issue #12, Decision #20). The service-role bypass-RLS pattern is correctly used everywhere "Admin all" appears in the PRD's RLS table, but nothing yet checks *whether the caller is actually an admin* before a server action reaches for that client. Must land before any Epic E code is written.
4. **§5.4 listing-limit gate has a TOCTOU race** (issues #19, #23): count-then-insert isn't serialized, so two simultaneous publishes at exactly the tier cap could both pass. Present in both `createListing` and `updateListing`'s publish path via the shared `checkListingLimitGate` helper — fixing it once fixes both call sites.
5. **No `view_count` column** (issue #22) — PRD Epic B4 AC1 asks the dashboard to show it; it doesn't exist in the schema at all.
6. **No read-side projection hides buyer delivery details on `orders` pre-`paid`** (issue #14) — the same column-privacy problem solved for `profiles`/`ratings` hasn't been addressed for `orders` yet, and matters as soon as any order-read path is built.
7. **`/dashboard/listings` has no inbound nav link** (issue #24) — no global nav/header exists yet.
8. **Dynamic listing form only reveals `usageIndicatorFields` conditionally** (issue #20) — other conditionally-required fields (e.g. Gadgets' `imei_last_6`, `storage_gb` by product type) always render once a category is picked. Server-side enforcement is complete; this is a UX-only gap.

---

## 6. Recommended next steps

In dependency order:

1. **Get Docker working and run `supabase db reset` + `supabase gen types`.** Nothing in the current codebase has been executed against a real database. This should happen before any further schema-touching work, to surface any of the 24 known-issue items that execution (not inspection) would catch.
2. **Admin-role mechanism** (Known Issue #12) — needed before any Epic E work, and it's a schema decision (`profiles.is_admin` or similar) that should land in its own migration, deliberately, not smuggled into an unrelated feature.
3. **Epic D (purchase & escrow)** is the largest missing surface and the one the PRD's core metrics depend on (listing-to-sale conversion, dispute rate) — checkout, the Paystack webhook, order state machine actions, dispute/rating flows. The `orders`/`disputes`/`ratings`/`payouts` schema and triggers already exist and are waiting for this layer.
4. **Epic C (discovery)** — browse, search, listing detail, seller public profile. Needed for Epic D to be usable end-to-end (a buyer needs somewhere to find a listing before checkout works), and is independent enough from D to potentially parallelize.
5. Close the TOCTOU race (#19/#23) and the orders-column-privacy gap (#14) opportunistically while touching those areas, rather than as standalone work.
6. **B3 (price guidance)** and **view_count (#22)** are small, self-contained, and can slot in whenever convenient — neither blocks anything else.

The next prompt, per `docs/HANDOFF.md`'s own stated plan, was contact-detail detection (§9.3) wired into `createListing` — `src/lib/moderation/contact-detector.ts` currently a stub that always reports "not detected," with one documented call site waiting for it.
