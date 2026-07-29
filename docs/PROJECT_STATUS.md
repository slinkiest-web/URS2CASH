# Urs2Cash — Project Status

**As of:** 2026-07-29 (Prompt 11)
**Sources:** `docs/urs2cash-prd.md` (v2.0, locked), `docs/HANDOFF.md` (Prompts 1–11), `docs/DECISIONS.md` (#1–50), `docs/KNOWN_ISSUES.md` (#1–24, several resolved/superseded by Prompt 11), repo state as of Prompt 11's uncommitted changes (`main`, one prior local-only commit `da5c0d4` also not yet pushed — see note below).
**Verified for this report:** `npm run typecheck`, scoped `eslint "src/**/*.{ts,tsx}"`, `npm run test` (107/107), `npm run build` all clean. Two new migrations applied via `npx supabase db reset` and live-verified (not just syntax-checked) — see §3.

**Uncommitted work note:** as of this report, both the `da5c0d4` docs-reorganisation commit (from the prior session) and all of Prompt 11's changes are local-only, not yet committed or pushed. Commit/push only on explicit instruction, per this project's standing git-safety norms.

This is a handoff snapshot, not a living doc — re-verify anything load-bearing before acting on it.

---

## 0. Environment note for a fresh session

A local Supabase stack has been running throughout recent sessions (`npx supabase start`, Docker required — see `README.md`). A gitignored `.env.local` populated with the local stack's demo keys already exists at the repo root. If starting fresh: confirm Docker is running, `npx supabase status` to check the stack, `npx supabase db reset` to get a clean seeded database (5 categories, nothing else), and `npm run dev` (note: port 3000 may be occupied by a leftover process from a prior session — Next will fall back to 3001).

---

## 1. What this product is

A peer-to-peer recommerce marketplace for Nigeria (beauty-first, multi-category from day one). Sellers list pre-owned goods, buyers pay through escrow-lite (Paystack), funds release on delivery confirmation, platform takes 10% commission. No chat, no negotiation, no auction — the whole product bet is that a seller's *second listing* is the thing to optimize for (primary success metric: **second listing rate within 30 days**, target ≥40%, kill threshold <20% at 8 weeks/50 sellers).

Ten "prompts" (build sessions) have shipped so far, each logged in full in `docs/HANDOFF.md`, plus one un-numbered session between Prompts 8 and 9 that fixed a critical schema-access bug (§3 below). This document summarizes where that leaves the codebase.

---

## 2. Implementation state by PRD epic

| Epic | Status | Notes |
|---|---|---|
| **A — Auth & profile** | Mostly built | Email/password signup+verify (Resend via SMTP relay), sign-in/out, middleware route protection, profile edit page. **Not built:** Paystack bank-account resolution/masking (A3 AC2–AC6), AC3 email-verification gate on publish/checkout (nothing to gate yet). |
| **B1 — Create listing** | Built | `/sell`, `createListing`, category registry + 5 Zod schemas, dynamic attribute form, photo upload, tier/cap limit gate, **real contact-detail detector wired in (Prompt 9)** — flags, never blocks. |
| **B2 — Listing velocity** | Built | Draft autosave (localStorage), "list another" flow, most-recent-category default, multi-photo parallel upload. |
| **B3 — Price guidance** | **Not built** | No `getPriceGuidance` action, no UI. |
| **B4 — Manage listings** | Mostly built | `/dashboard/listings`, `updateListing`/`removeListing` (both now also scan for contact details on every edit), immutable-field enforcement, blocking-order check. **Gap:** no `view_count` (schema never added it — issue #22). |
| **C1 — Category browse** | **Built (Prompt 10)** | `/c/[slug]`, Server Component, 404s on `browsable=false` or unknown slug, price/condition/registry-attribute filters with state entirely in the URL. |
| **C2 — Search** | **Built (Prompt 10)** | `/search`, full-text via a new `search_listings` SQL function over the §7.1 tsvector index, cross-category, `browsable` never checked — verified live. |
| **C3 — Listing detail** | **Built (Prompt 11)** | `/l/[id]`, Server Component. Photo gallery with flaw-tagged labels, registry-driven generic attribute display (two-claims prominence, measurements sub-table, computed remaining-PAO), full condition definition text, seller reputation block, OG tags, `imei_last_6` stripped at the data layer. Reachable regardless of `browsable`; widened to also serve `sold` listings (new RLS policy). |
| **C4 — Seller public profile** | **Not built — next up** | No `/s/[handle]`. The reputation query/component were built reusable in Prompt 11 specifically for this — import as-is, don't rebuild. |
| **D — Purchase & escrow** | **Not built** | No checkout, no Paystack webhook route, no order state machine code (schema + triggers exist), no shipping/delivery/dispute/rating actions. |
| **E — Admin** | **Not built** | No `/admin` routes, no admin server actions, no admin-role mechanism at all (Known Issue #12). |
| **Moderation (§9.3)** | **Built (Prompt 9)** | Real Nigerian-phone/email/WhatsApp/Instagram/Telegram/URL detector, wired into listing create + edit. Rating-review scanning has no call site yet (`ratings.ts` action doesn't exist — Epic D6). |

**Net:** the database schema is complete for the whole PRD and, as of the un-numbered session before Prompt 9, **actually verified against a live Postgres instance** — this is new since the last status report. The application layer now covers **Epic A (partial), Epic B (full except price guidance), moderation detection, and three-quarters of Epic C** (browse + search + listing detail; only seller public profile remains). **Epics D and E have zero application code.**

---

## 3. Database schema — now live-verified, not just written

Seven migrations exist. Every one has been applied via `npx supabase db reset` against a real local Postgres instance and spot-verified by direct query/trigger execution — this closes what was previously the single largest cross-cutting risk in the project (Known Issues #1/#2/#8/#13/#16/#17/#18, all now resolved or superseded).

| Migration | Contents |
|---|---|
| `20260727202617_profiles.sql` | `profiles`, `payout_accounts`, RLS, `profiles_public` view, `handle_new_user` trigger |
| `20260727215742_categories_listings.sql` | `categories`, `listings`, RLS, 6 indexes, `assign_seller_listing_index` / immutable-field / `updated_at` triggers, seed data (5 categories) |
| `20260728100239_orders_and_related.sql` | `orders`, `disputes`, `ratings` (+`ratings_public` view), `payouts`, `moderation_flags`, `webhook_events`, RLS |
| `20260728102304_triggers.sql` | `completed_sales_count` increment, `recompute_seller_rating`, `dispute_upheld_count` increment |
| `20260728134156_listing_photos_storage.sql` | `listing-photos` Storage bucket + RLS on `storage.objects` |
| `20260729055455_grant_table_privileges.sql` | **The critical fix** — see below |
| `20260729070438_search_listings_function.sql` | `search_listings()` SQL function backing Epic C2, using the existing tsvector index expression verbatim |
| `20260729080000_profiles_public_dispute_rate.sql` | Adds `dispute_upheld_count` to `profiles_public` — Epic C3's reputation block needs it for dispute rate (Decision #44) |
| `20260729080500_listings_select_sold.sql` | Widens the public `listings` SELECT policy to also allow `status = 'sold'`, not just `'published'` — required by Epic C3 AC6 (Decision #45) |

**What "live-verified" actually means, concretely:**
- The 5 seeded categories carry correct `listable`/`browsable`/`photo_min`/`allowed_conditions` (only Beauty browsable).
- `assign_seller_listing_index`, `increment_completed_sales_count`, `recompute_seller_rating`, `increment_dispute_upheld_count` all fire correctly under real inserts/updates — including, for the rating trigger, from an actual `authenticated`-role session (not just the `postgres` superuser), which is the real test of its `SECURITY DEFINER` boundary (Known Issue #16, now resolved).
- `database.types.ts` was diffed against a real `supabase gen types` run and found to match the hand-authored version field-for-field (two harmless differences: view nullability, `Relationships` completeness) — then, in Prompt 10, **actually swapped to the genuine CLI-generated file**, since `search_listings`'s RPC type needed it. Known Issues #1/#10 resolved.

**The critical bug this live-verification found and fixed:** no migration had ever issued table-level `GRANT`s to `anon`/`authenticated`/`service_role`. RLS policies were all correctly written, but Postgres checks table-level grants *before* evaluating RLS — so every base table returned "permission denied" for every role, including `service_role` (its `BYPASSRLS` attribute bypasses RLS policies, not table grants — a distinct mechanism). This was invisible until Docker made live testing possible; `docs/DECISIONS.md` #18 had flagged the risk and left it conditional on exactly this kind of verification. Root cause: tables are owned by `postgres` (the role migrations run as), and Supabase's own Postgres bootstrap only auto-grants full CRUD to `anon`/`authenticated`/`service_role` for tables owned by `supabase_admin`, not `postgres` — confirmed by reading the Postgres image's own bootstrap SQL directly, not by inspection alone. `20260729055455_grant_table_privileges.sql` grants exactly what each table's RLS policies already expect to enforce, scoped per PRD §7.2's access model. Re-verified end to end afterward: a real authenticated buyer session can insert a rating and the `SECURITY DEFINER` trigger correctly updates the seller's profile.

---

## 4. Key architectural decisions (see `docs/DECISIONS.md` for full reasoning)

- **Column-vs-JSONB split:** shared fields (`price_kobo`, `condition`, etc.) are real columns; category-local fields live in a Zod-validated `attributes` JSONB column. `condition` is modeled *inside* each category's Zod schema, then destructured back out before persisting (Decision #9).
- **Public-column-privacy pattern:** a table with RLS that can't express "hide column X but keep column Y public" gets a dedicated `_public` view instead. Applied to `profiles` and `ratings`. **Not yet applied to `orders`** for buyer delivery details pre-`paid` (Known Issue #14, still open).
- **`seller_listing_index`** is assigned by an advisory-lock-serialized Postgres trigger, never application code — now confirmed correct by live execution, not just design.
- **Registry-driven categories:** all 5 category Zod schemas resolve dynamically by slug; no `switch` on category name anywhere.
- **Table GRANTs are not optional even with correct RLS** — Postgres requires both a table-level grant *and* a passing RLS policy; RLS alone is inert without the grant (the reason every future migration must declare GRANTs alongside its RLS policies, in the same migration, going forward).
- **Contact-detail detection (§9.3) is recall-favoring by design**, never a block path: Nigerian phone formats (including letter-substitution and spelled-out digits), email, WhatsApp/Instagram/Telegram, generic URLs. A real bug was caught by its own test battery — an unanchored regex let obfuscation letters bleed into adjacent English words, corrupting detection; fixed with token-boundary assertions (Prompt 9).
- **`browsable` gates the buyer category grid and nav ONLY** (§6.2) — search, "recently listed," and listing detail must never check it. Verified live in Prompt 10 by seeding a non-browsable-category listing and confirming it's absent from the grid but present in search results.
- **Attribute filters on category pages are scoped to `enum`/`boolean` fields only** (Decision #42) — the only types that map to JSONB containment (`@>`), which is what the existing GIN index actually accelerates. Numeric range filters (e.g. battery health %) are out of scope until a different index shape exists.
- **`database.types.ts` is now genuinely CLI-generated** (Decision #43) — never hand-edit it again; regenerate and commit alongside every future migration.
- **Listing-detail attribute rendering is generic and field-name-keyed, never a category-slug switch** (Decision #47) — the two-claims rule (functional_status/cosmetic_grade prominence), remaining-PAO computation, and measurements-as-a-table all key off field names/kinds that recur verbatim across categories, not per-category branches.
- **Admin-only attribute fields (e.g. Gadgets' `imei_last_6`) are stripped at the data-access layer via a registry-declared field list** (`adminOnlyAttributeFields`, Decision #46), not merely skipped at render time — they never enter the RSC payload at all.
- **Public read access on `listings` now covers `status in ('published', 'sold')`, not just `'published'`** (Decision #45) — a real gap Epic C3 AC6 surfaced; every other status (draft/removed/suspended) stays non-public.

---

## 5. Known issues (see `docs/KNOWN_ISSUES.md` for the full list; several resolved since the last report)

**Resolved since the last status report:** #1, #10 (hand-authored types → real CLI-generated), and the entire Docker-unavailable family (#1/#2/#3/#4/#8/#13/#16/#17/#18) via live verification. #24 (no global nav) is partially resolved — Prompt 10 built one, but it's buyer-facing only and still doesn't link to `/dashboard/listings`. The former "`/l/[id]` doesn't exist" gap is now resolved (Prompt 11).

**Still open, in rough priority order:**
1. **No admin-role verification mechanism exists anywhere** (issue #12, Decision #20). Must land before any Epic E code is written — this is a schema decision (an admin claim/column) that deserves its own deliberate migration.
2. **§5.4 listing-limit gate has a TOCTOU race** (issues #19, #23): count-then-insert isn't serialized in either `createListing` or `updateListing`'s publish path.
3. **No read-side projection hides buyer delivery details on `orders` pre-`paid`** (issue #14) — matters as soon as any order-read path is built (i.e., as soon as Epic D starts).
4. **No `view_count` column** (issue #22) — Epic B4 AC1 asks the dashboard to show it; doesn't exist in the schema.
5. **`/dashboard/listings` still has no inbound nav link** (issue #24) — a global nav now exists (Prompt 10) but is buyer-facing only; needs a seller-facing link added.
6. **Dynamic listing form only reveals `usageIndicatorFields` conditionally** (issue #20) — other conditionally-required fields always render once a category is picked. Server-side enforcement is complete; UX-only gap.
7. **Numeric attribute range filtering is out of scope on category pages** (Decision #42) — not a defect, a documented scope boundary tied to the current GIN index shape.
8. **No edge caching (`revalidate`) on any discovery/detail page** — `createClient()`'s use of `cookies()` forces dynamic rendering regardless of any `revalidate` export; genuine caching would need a separate non-cookie-bound anon client, a real architecture change not taken on as a side effect of Prompt 10 or 11.
9. **A seller can preview her own `draft` listing at `/l/[id]`** (new, Prompt 11) — an incidental consequence of `listings_select_own` RLS letting an owner read any status of her own row. Not harmful (no purchase path exists to expose), not asked for, just worth knowing.
10. **Per-listing hygiene notices (e.g. flagging Beauty's hygiene-sensitive product types specifically) were not built** (new, Prompt 11, Decision #49) — narrowed to what's registry-derivable; Personal Care's category-wide "used disallowed" policy is already structurally visible via its condition selector.
11. **`support_contact_opened`'s client-side firing was read for correctness, not exercised in a real browser** (new, Prompt 11) — no browser-automation tooling was available in this environment to click the link and observe the console log.

---

## 6. Recommended next steps

In dependency order:

1. **Seller public profile (`/s/[handle]`) — Epic C4.** The immediate next prompt. AC2 needs a query shaped like `getRecentlyListed` (Prompt 10) but scoped to one seller, never checking `browsable`. AC3's reputation block is already done — `src/lib/reputation/get-seller-reputation.ts` and `src/components/reputation/seller-reputation-block.tsx` (Prompt 11) were built reusable specifically for this; import as-is, don't rebuild.
2. **Admin-role mechanism** (Known Issue #12) — needed before any Epic E work; land it as its own deliberate migration.
3. **Epic D (purchase & escrow)** — the largest remaining surface and the one the PRD's core success metrics (listing-to-sale conversion, dispute rate) depend on. Schema and triggers already exist; checkout, the Paystack webhook, order-state-machine actions, and dispute/rating flows do not.
4. Close the TOCTOU race (#19/#23) and the orders-column-privacy gap (#14) opportunistically while touching those areas in Epic D, rather than as standalone work.
5. **B3 (price guidance)**, **view_count (#22)**, and the seller-facing nav link (#24) are small, self-contained, and can slot in whenever convenient.

Rating-review contact-detail scanning (§7.1 HARD RULE, Epic D6) has a documented TODO in `src/lib/moderation/contact-detector.ts`'s module docstring specifying exactly how to wire it once `submitRating`/`src/lib/actions/ratings.ts` exists — don't rebuild this from scratch when Epic D6 lands.
