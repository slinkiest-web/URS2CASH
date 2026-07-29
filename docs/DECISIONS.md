# Decisions

Permanent architectural and implementation decisions, with reasoning and
revisit guidance. Append new items under the prompt that made them — this
file is a durable record, not a changelog of temporary state (that's
`docs/KNOWN_ISSUES.md`).

---

## From Prompt 2

### 1. Public profile reads go through a `profiles_public` view, not a direct RLS "public read" policy on `profiles`
**Why:** RLS is row-level, not column-level. PRD §7.2's summary — "Public
read of non-suspended. Self update." — read literally as a single policy
would also expose `phone` to every anonymous reader. The base `profiles`
table is self-read/self-update only; `profiles_public` (owned by a role that
bypasses RLS on the base table) exposes only `id, display_name, handle,
avatar_url, bio, state, completed_sales_count, rating_average, rating_count,
created_at` to `anon`/`authenticated`, filtered to non-suspended.
**Revisit:** When Epic C (seller public profile, listing detail reputation
block) is built — confirm the view's column list covers what C3 AC5 / C4
need, and add columns there, never on the base table's policy.

### 2. `profiles.state` is nullable, not `NOT NULL` as PRD §7.1 literally specifies
**Why:** The `handle_new_user` trigger creates the `profiles` row in the same
transaction as `auth.users` (Epic A1 AC1), before the seller has supplied a
state (Epic A3). A hard `NOT NULL` with no sane default would make every
signup fail. "Required" is enforced instead at the Zod boundary on the
profile-completion form.
**Revisit:** Yes — this needs explicit sign-off, since it contradicts the
literal column spec rather than just an implementation detail. When Epic B
(listing publish) is built, decide whether publish requires a completed
profile (non-null `state`), and make sure nothing assumes `state` is always
set.

### 3. Auth is email + password with a verification email; no OTP, no Google OAuth
**Why:** PRD §5.1/Epic A1 specify password auth (≥8 chars) with email
verification via Resend. §5.2 explicitly lists "Social login" as out of
scope with a HARD RULE to stop and flag rather than implement it. Prompt 2's
instructions initially asked for OTP + Google OAuth; this was flagged as a
conflict and resolved in favor of the PRD.
**Revisit:** No, unless the PRD itself is amended to add social login or
passwordless auth — that would be a deliberate scope change, not a
revisit of this decision.

### 4. Signup confirmation email is sent via Supabase Auth's SMTP-relay-to-Resend, not custom Resend API + React Email code
**Why:** Epic A1 AC2 requires the email be "sent via Resend" but doesn't
mandate the implementation path. Routing Supabase Auth's built-in
confirmation flow through Resend's SMTP relay (`config.toml`
`[auth.email.smtp]`) satisfies this without reimplementing token
generation/expiry/resend logic Supabase Auth already owns.
**Revisit:** Yes, at the boundary — when Epic D/E notification emails
(order confirmation, shipment, payout) are built, confirm the intended split
is "auth-lifecycle emails via SMTP relay, product emails via Resend API +
React Email," since the PRD's stack table (§12.1) doesn't describe two
separate email pipelines explicitly.

### 5. Generated database types live at `src/lib/database.types.ts`, not `src/lib/supabase/types.ts`
**Why:** Prompt 2's instructions specified this path explicitly, superseding
the convention documented in Prompt 1's README. The PRD doesn't mandate a
specific file location.
**Revisit:** No. README and all three Supabase client imports were updated
to match; this is the canonical location going forward.

### 6. `profiles`/`payout_accounts` carry DB-level CHECK constraints beyond what the PRD explicitly mandates
(`display_name` length, `bio` length, `handle` format, `phone` E.164 format,
`account_number` format)
**Why:** PRD §7.1 states these as descriptive notes, not HARD RULEs
demanding DB enforcement for these two tables (unlike
`listings.condition_notes`, which explicitly gets one). Added as
defense-in-depth against writes that bypass Zod — direct service-role
scripts, future migrations, admin tooling.
**Revisit:** Low priority — only if a legitimate future write path needs
values outside these bounds (e.g., an admin override intentionally out of
normal range).

### 7. Admin access to `profiles`/`payout_accounts` relies entirely on the service-role client bypassing RLS — no explicit admin RLS policies were added
**Why:** PRD §4 and §11.2 establish that admin mutations use the service
role in server actions only, which bypasses RLS by design. Adding
admin-specific RLS policies on top would be redundant and would create a
second, weaker enforcement path.
**Revisit:** No, this is the intended architecture. Re-confirm only if a
future epic needs admin reads directly from a client context (unlikely given
§11.2).

### 8. `Result<T>` server action convention centralized in `src/lib/result.ts`
**Why:** PRD §11.3 mandates that server actions never throw to the client
and instead return a discriminated union. Rather than let each action define
its own shape, `Result<T>`/`ok()`/`err()` live in one shared module for every
future server action (auth, profile, and beyond) to reuse.
**Revisit:** No.

---

## From Prompt 3

### 9. Each category schema's `rawAttributes` input includes `condition`, even though `condition` persists to a real `listings` column, not JSONB
**Why:** PRD §6.1/§7.1 make `condition` a real, indexed column, separate from
`attributes` JSONB. But nearly every category's business rules in §6.4 are
conditional on `condition` (e.g. "required unless brand_new," "required when
used"), and the task required those rules be encoded as Zod refinements on a
single schema per category. The only way to write one self-contained,
directly-testable schema per category is to include `condition` as a field
inside it, constrained per category to that category's `allowedConditions`
(this is what makes `used` *structurally* impossible to select for
`personal_care` — its schema's `condition` enum simply has no third value).
The resolver (`resolveCategoryAttributes`) therefore returns `condition`
bundled with the rest of the validated attributes; **the caller must
destructure `{ condition, ...attributes }` before persisting** —
`condition` to `listings.condition`, the rest to `listings.attributes`.
**Revisit:** Yes, mandatory, in the next prompt. Whoever writes the
listing-creation server action needs to know this split isn't automatic —
flagged here and in `docs/HANDOFF.md` so it isn't missed.

### 10. `pao_months` is modeled as a string enum (`"3" | "6" | ... | "36"`), not an integer
**Why:** PRD §6.4.1/§6.4.4 both type it as `enum` (not `integer`/`number`)
with bare numerals in backticks as the listed values. Zod's `z.enum()` is
string-only; modeling it as an integer union would contradict the PRD's own
"Type: enum" column. Since the values just need to match consistently
between schema and future UI (a dropdown of month bands), the string-vs-number
choice has no behavioral consequence as long as it's applied consistently,
which it is (Beauty and Personal Care use the identical set).
**Revisit:** No, unless a future prompt needs to do arithmetic on the value
(e.g. computing remaining PAO), at which point it gets parsed to a number at
the point of use, not re-modeled in the schema.

### 11. Unknown attribute keys use `.strict()` (hard rejection), not `.strip()` (silent removal)
**Why:** The task instructions named `.strict()` explicitly. Rejecting
outright (a failed parse) is a strictly stronger guarantee than silently
stripping — it also surfaces a caller bug (a stale field name, a typo) as a
visible validation error instead of silently discarding data, which matches
PRD §6.1's "JSONB is never written without Zod validation, no exceptions"
posture better than silent stripping would.
**Revisit:** No.

### 12. `maxPhotos` in the registry is a single global constant (8), not a per-category value
**Why:** PRD §6.4 only specifies per-category *minimums*. The maximum (8) is
defined once, globally, on `listings.photo_urls` in §7.1 ("min per category,
max 8"). The registry's `maxPhotos` field exists per category config for
convenience at call sites, but every category currently resolves to the same
constant — not invented, sourced directly from §7.1.
**Revisit:** No, unless the PRD later gives categories different maximums.

### 13. Schema files live at `src/lib/categories/schemas/*.ts`, not flat under `src/lib/categories/*.ts`
**Why:** PRD §6.5's illustrative tree shows schema files directly under
`lib/categories/` (`beauty.ts`, `fashion.ts`, ...); this prompt's own
instructions explicitly specified a `schemas/` subdirectory. Neither the
registry HARD RULE ("single registry keyed by slug, dynamic resolution") nor
any other HARD RULE constrains exact file layout, so the more specific,
more recent instruction was followed.
**Revisit:** No, cosmetic.

### 14. `vitest` added as the project's test runner
**Why:** No test runner existed before this prompt, and the task required
real, running unit tests per category, not illustrative examples. Vitest was
chosen over Jest for native ESM/TypeScript support with minimal
configuration, given the project has no existing test infrastructure to stay
consistent with.
**Revisit:** No, unless a future prompt has a specific reason to need Jest
(e.g. a tool that only has a Jest integration).

---

## From Prompt 4

### 15. `categories`/`listings` schema follows PRD §7.1 exactly, not this prompt's own item list
**Why:** The prompt's instructions asked for `min_photos`/`max_photos`/
`attribute_schema_key` on `categories`, `view_count`/`sold_at` on `listings`,
and a 4-index list that reordered one PRD index and substituted/dropped two
others. Grepped the full PRD for every one of those terms — zero hits
anywhere outside this prompt's own instructions. Flagged before writing any
code; you chose "follow PRD §7.1 exactly." `categories` has only
`photo_min` (no per-category max — max is the single global constant 8, per
§7.1's note on `listings.photo_urls`, matching Prompt 3's decision #12) and
no `attribute_schema_key` (the mapping key to the registry is `slug`, which
already exists). `listings` has exactly the 18 §7.1 columns. All 6 §7.1
indexes exist verbatim, in the PRD's column order, including the
`(seller_id, seller_listing_index)` index the primary metric depends on,
which the task's own list had omitted.
**Revisit:** No — this was the resolved conflict, not a judgment call.

### 16. `seller_listing_index` assignment: advisory-lock-serialised trigger, fires at the moment `status` becomes `published`
**Why:** PRD §7.1 HARD RULE requires this be trigger-assigned, never by
application code, and "must not be racy." A naive `SELECT MAX(...) + 1` has
a race between concurrent publishes by the same seller. `pg_advisory_xact_lock(hashtext(seller_id)::bigint)`
serialises concurrent trigger executions per seller within the transaction —
the second transaction blocks until the first commits, then sees its
committed row via `MAX()`. The trigger fires on `INSERT` when a row is
created already `published` (the common case, since `status` defaults to
`published` and PRD's model doesn't really have server-persisted drafts —
see Prompt 2's decision on `profiles.state`/draft handling) and on `UPDATE`
specifically on a `draft`→`published` transition (`OLD.status IS DISTINCT
FROM 'published'`), never on a no-op update to an already-published row.
Rows inserted directly as non-published get a `0` sentinel, which `MAX()`
ignores once/if they're later published — no gap or corruption in the
sequence either way, since the count is over *all* of a seller's listings
regardless of current status (a later-removed listing keeps its original
slot).
**Revisit:** No, this is a standard, well-understood Postgres pattern for
"next sequence number per group" — revisit only if `seller_listing_index`
ever needs to be reassigned/renumbered after the fact, which nothing in the
PRD suggests.

### 17. Added a `flaw_photo_indexes` non-empty CHECK for `used` listings, beyond what this prompt's item list explicitly asked for
**Why:** The prompt's item 1 named only the `condition_notes` ≥ 20 chars
check as a deliverable. But PRD §6.3's HARD RULE covers both in the same
sentence: *"`used` requires a non empty `condition_notes` field, minimum 20
characters, plus at least one photo tagged as wear evidence via
`flaw_photo_indexes`. Enforced by Zod, enforced by database constraint."*
Adding the second constraint doesn't contradict anything asked for and
closes a HARD RULE gap that would otherwise need to be logged as a known
issue for no reason. Caught a real bug while implementing it: `array_length()`
returns `NULL` for an empty array, and `NULL` in a CHECK constraint passes —
fixed with `coalesce(array_length(...), 0) >= 1` (applies to
`condition_notes` too, already handled there via `coalesce(condition_notes, '')`).
**Revisit:** No.

### 18. No explicit `GRANT` statements on `categories`/`listings` for `anon`/`authenticated`
**Why:** Consistent with Prompt 2's `profiles`/`payout_accounts` migration,
which also relies on Supabase's standard default-privilege configuration
(new tables in `public` are grantable to `anon`/`authenticated` by default at
the project level; RLS is the actual gate, not table-level grants). Adding
redundant explicit grants here without evidence Prompt 2's precedent was
wrong would be inconsistent, and neither the categories/listings migration
nor any earlier feedback flagged Prompt 2's approach as incorrect.
**Revisit:** Only if `db reset` verification (once Docker exists) shows
`anon`/`authenticated` actually can't read `categories`/published `listings`
— in which case Prompt 2's tables have the same latent problem and both
migrations need explicit `GRANT` statements added together.

### 19. `categories.sort_order` seeded 1–5 in §6.4's own presentation order (Beauty, Fashion, Gadgets, Personal Care, Home Goods)
**Why:** PRD §6.4 never specifies sort order values for any category — the
prompt's instructions said to source it from §6.4 "per each spec," but no
such value exists there. Used the document's own subsection order
(§6.4.1–§6.4.5) as the least-arbitrary default.
**Revisit:** No — Epic E4 gives admin a UI to reorder categories; this is a
placeholder default, not a fixed value.

### 20. Clarifying #7: "admin via service-role bypass" is two distinct mechanisms, and only one of them is built
**Why this needs stating explicitly:** every table's RLS summary in §7.2
resolves to "Admin all" through two separate things. (a) The service-role
Supabase client bypasses RLS entirely — a Postgres/Supabase-level mechanism,
correctly used throughout `profiles`, `payout_accounts`, `categories`, and
`listings`, matching §4's *"Everything, via service role"* and §11.2's
*"Admin mutations use the service role in server actions only."* This part
is done and permanent. (b) Something must verify the caller is actually an
admin before a server action is allowed to reach for that client at all —
required by §11.2 (*"every admin action re-verifies admin role from the
database"*) and explicitly deferred by §15.5 B22 (*"mechanism decided in
Phase 3's first migration"*). Part (b) does not exist anywhere in the
codebase yet — no admin claim/column, no reusable check. Decision #7 was
correct about (a) but didn't separately flag that (b) was still missing;
this entry exists so that gap isn't mistaken for already-solved.
**Revisit:** Mandatory, when Epic E (Admin) is built. Tracked as an open
item in `docs/KNOWN_ISSUES.md` #12 (generalizing #5 to every "Admin all"
table, not just `/admin` middleware).

---

## From Prompt 5

### 21. Built `disputes` (a real PRD table), not `order_events` (this prompt's ask, unsourced anywhere in the PRD)
**Why:** PRD §7.1 defines `disputes` in full, with its own §7.2 RLS row, and
Epic D5 (raising)/E2 (arbitration) depend on it existing. Grepped the whole
PRD for `order_events`/`from_status`/`to_status`/`actor_role` — zero hits
outside this prompt's own instructions. Flagged before writing code; you
chose to add `disputes` and skip `order_events`.
**Revisit:** No — this was the resolved conflict, not a judgment call. If an
append-only order-transition audit log is wanted later, it should be scoped
as its own deliberate addition, not smuggled in under a table name absent
from the data model.

### 22. `payouts`/`webhook_events` schema follows PRD §7.1 exactly, not this prompt's own item list
**Why:** the prompt asked for `payouts.status` = `queued`/`processing`/`completed`/`failed`
and a plural `order_ids`; PRD §7.1 specifies exactly `queued`/`paid`/`failed`
and a singular `order_id UNIQUE` (HARD RULE: one payout row per order,
created automatically on release, never batched, never created manually).
Similarly, the prompt asked for a single `paystack_event_id UNIQUE` column
on `webhook_events`; PRD specifies `provider` + `event_id` as two columns
with a composite `UNIQUE (provider, event_id)`, explicitly so the idempotency
mechanism isn't Paystack-specific if another provider is ever added. Both
flagged before writing code; resolved in favor of PRD §7.1 exactly.
**Revisit:** No.

### 23. `disputes.reason` uses §10 Epic D5 AC2's 7-value enum, not §7.1's literal 6-value one
**Why:** discovered while implementing decision #21 — §7.1's table (`not_received`,
`condition_mismatch`, `wrong_item`, `damaged`, `counterfeit`, `other`)
contradicts §10 Epic D5 AC2 (`not_received`, `not_as_described`, `damaged`,
`wrong_item`, `counterfeit`, `shipping_cost_dispute`, `other`), which is
independently reinforced by a §8.4 HARD RULE (*"`shipping_cost_dispute`
exists as a dispute reason code from launch"*) and an explicit AC2b failing
condition (*"fails if the reason code is omitted"*). Three separate,
emphatic PRD statements outweigh one data-model table that appears to
predate the shipping-cost-dispute mechanism. Flagged with exact line quotes;
you chose §10/§8.4's enum.
**Revisit:** No, unless the PRD is corrected to reconcile §7.1's table with
§10/§8.4 — at which point this decision should be re-read against whatever
the corrected text says, since it may no longer be a contradiction.

### 24. `ratings_public` view added, extending decision #1's pattern to a second table
**Why:** §7.2's ratings policy summary — *"Public read where `is_hidden = false`.
Score is public even when hidden."* — is two conditions that can't both be
true under one row-level RLS policy: a `USING (is_hidden = false)` policy
would hide the *entire* row (including the score) for hidden ratings,
contradicting "score is public even when hidden." Same shape as decision #1
(`profiles_public` hiding `phone` while keeping other columns public). The
base `ratings` table has no SELECT policy at all — only an INSERT policy
(buyer, on a `released`/`refunded` order) and, per §7.2's "no update, no
delete, for any role," no UPDATE/DELETE policy either (admin's `is_hidden`
update goes through the service-role client). `ratings_public` exposes every
row with `review` nulled when `is_hidden`, `score` always intact.
**Revisit:** When Epic D6/C3 are built, confirm `ratings_public` — not the
base table — is what every read path uses.

### 25. Defense-in-depth CHECK constraints added to `orders` beyond this prompt's explicit ask
(`commission_kobo = floor(amount_kobo * 0.10)`, `seller_payout_kobo = amount_kobo - commission_kobo`, `buyer_id <> seller_id`)
**Why:** each is a direct, unambiguous formula or rule stated elsewhere in
the PRD (§8.3's commission formula, twice; Epic D1 AC10's "a seller cannot
purchase their own listing") — not invented, just enforced one layer lower
than the server action that will also check them. Same pattern as Prompt
4's `condition_notes`/`flaw_photo_indexes` constraints.
**Revisit:** No.

---

## From Prompt 6

### 26. `seller_listing_index` naming stays unified — no `seller_listing_ordinal`
**Why:** this prompt's instructions asserted the `listing_published` event
property is named `seller_listing_ordinal`, deliberately different from the
`listings.seller_listing_index` column. Grepped the whole PRD for
"ordinal" — zero hits anywhere. §3.5 (line 164) lists `listing_published`'s
property as `seller_listing_index`, the same name as the column (§7.1).
There is no dual-naming scheme to preserve. Flagged before writing code;
you chose to keep one name.
**Revisit:** No, unless the PRD is later amended to actually introduce a
distinct event-payload name.

### 27. Did not rebuild the `seller_listing_index` trigger — it already exists (Prompt 4)
**Why:** this prompt's item list asked for a BEFORE-trigger assigning
`seller_listing_index` at publish time, advisory-lock-serialised, counting
the seller's prior published listings — which is exactly
`assign_seller_listing_index`, already built and shipped in Prompt 4's
migration. Building a second trigger on the same column would fire
alongside the existing one on every insert/update to `listings`; at best
redundant, at worst a source of subtle bugs if the two ever computed
different values. Flagged before writing code; you chose to skip it.
**Revisit:** No — if this trigger ever needs to change, it should be
altered in place (a new migration that `DROP`s and recreates it), not
duplicated.

### 28. `recompute_seller_rating` is `SECURITY DEFINER`; the other two new triggers are not
**Why:** ratings are inserted by the buyer's own authenticated session
(Prompt 5's RLS: `ratings_insert_buyer_on_concluded_order` lets the buyer
insert directly, no service-role hop) — but the trigger must update the
*seller's* `profiles` row, a different row than the inserting user's own.
Without `SECURITY DEFINER`, `profiles_update_own`'s `auth.uid() = id` check
would silently block the update: 0 rows affected, no error, because the
buyer isn't the seller. `orders` and `disputes` have no `UPDATE` policy for
`authenticated` at all (Prompt 5) — the only way `increment_completed_sales_count`
or `increment_dispute_upheld_count` can fire is a service-role transition,
which already bypasses RLS for the whole transaction, so those two don't
need the elevation. Matches Prompt 2's `handle_new_user` precedent for when
`SECURITY DEFINER` is actually necessary versus reflexively applied
everywhere.
**Revisit:** Yes, once Docker exists — this is correct by RLS-policy
inspection (traced against Prompt 5's actual policies, not assumed), not
yet confirmed by execution. Tracked in `docs/KNOWN_ISSUES.md` #16.

### 29. `completed_sales_count` is a plain `+1` increment; `rating_average`/`rating_count` are a full recompute
**Why:** the task itself drew this distinction — "increment" for the sales
counter, but "recompute must be correct, not incremental-only if that risks
drift" for ratings. A simple `col = col + 1` UPDATE is race-safe under
Postgres's normal row-level locking (the second of two concurrent
transactions blocks until the first commits, then reads the already-updated
value) without needing an advisory lock, unlike `seller_listing_index`'s
`MAX()`-based assignment. Ratings get a full `SELECT count(*), avg(score)`
recompute instead, over all of that seller's ratings, since an incremental
running average is more failure-prone to get right than a cheap recompute
at low per-seller insert volume.
**Revisit:** No.

---

## From Prompt 7

### 30. `CreateListingInput` keeps `condition` as its own top-level field; `createListing` merges it into the resolver's raw input internally
**Why:** `listings.condition` is a real, shared column (§6.1/§7.1) and every
category's UI has one condition selector, not something buried inside
category-specific attributes — so the external server-action signature
keeps it top-level, matching the PRD's conceptual model. Internally,
`resolveCategoryAttributes` needs `condition` bundled with the attributes
(per decision #9, Prompt 3) since the category schemas' cross-field rules
key off it — `createListing` does `{ condition: input.condition,
...input.attributes }` before calling it, and destructures `{ condition,
...attributes }` from the validated result before the insert. This is the
first place decision #9's documented split actually gets exercised.
**Revisit:** No.

### 31. Category list for `/sell` is a hybrid: DB for admin-controlled fields, registry for code-authoritative ones
**Why:** `sort_order`/`listable`/`browsable` are admin-controlled (Epic E4)
and only exist in the `categories` table, not the registry — so the page
queries the DB for those, ordered by `sort_order`. `minPhotos`/`maxPhotos`/
`allowedConditions`/the schema itself stay registry-authoritative per
§6.5's HARD RULE ("the registry is the single source of truth for photo
minimums, allowed conditions, and attribute validation"). The two are
joined by slug for the UI's combined category list.
**Revisit:** When the §6.5 startup assertion (`docs/KNOWN_ISSUES.md` #9)
is eventually built, this join becomes exactly the place drift between the
DB row and the registry would surface first.

### 32. `listing-photos` Storage bucket: public read, 5MB size cap, JPEG/PNG/WebP only
**Why:** PRD §7.1 stores `photo_urls` as plain public-servable strings, and
§15.5 B20 says client-side compression with no processing pipeline — so a
public-read bucket matches how the rest of the app already treats photo
URLs (no signed-URL complexity anywhere else in the schema). The size cap
and MIME allowlist aren't PRD-specified; they're a reasonable, uncontroversial
default for a photo-upload bucket, not a value invented to satisfy a
specific rule.
**Revisit:** Low priority — revisit only if a real seller hits the 5MB cap
with a legitimate photo (raise it) or if HEIC/other formats need support.

### 33. `usageIndicatorFields` added to the registry as UI-reveal metadata, kept separate from validation
**Why:** AC5 asks the form to reveal a category's usage indicator set when
`used` is selected. Deriving that generically from a Zod shape isn't
possible (Zod doesn't expose which fields a `superRefine` conditionally
requires), and hardcoding it in the form component would violate AC3's
"no hardcoded per-category fields." Adding a small, PRD-§6.3-sourced
`usageIndicatorFields: readonly string[]` export per category schema,
aggregated into the registry, keeps this registry-driven: the form reads
`category.usageIndicatorFields`, never a category-name switch. Two fields
§6.3's summary table lists alongside genuine usage indicators —
Gadgets' `battery_health_percent`/`functional_status`, Home Goods'
`functional_status` — are deliberately excluded, since their own §6.4
detailed rules gate them on `product_type`/`is_powered`, not `condition`;
including them would have hidden an always-or-conditionally-required field
until `used`, which is wrong.
**Revisit:** No, unless the PRD's §6.3 usage indicator sets change.

### 34. Listing-level validation lives in a new `buildListingSubmissionSchema`, separate from the category attribute resolver
**Why:** closes the gap flagged in `docs/KNOWN_ISSUES.md` #11 (Prompt 5) —
`title`/`description`/`price_kobo`/`photo_urls`/`flaw_photo_indexes`/
`condition_notes` are real `listings` columns, not category `attributes`
JSONB, and were always out of scope for Prompt 3's category-registry
resolver. The two compose in `createListing`: the listing-level schema
validates the shared fields (with a per-category dynamic photo-count
bound), the resolver validates category attributes + `condition`
membership — exactly one place decides each kind of rule, never two.
**Revisit:** No.

## From Prompt 8

### 35. Server-side drafts require the same full validation as a publish — only the cap check and `status` differ
**Why:** the task collided two HARD RULES. §5.4: "AC0 fails if the limit
blocks draft creation rather than publish" — draft creation must be real
and uncapped. §6.1: "JSONB is never written without Zod validation. There
are no exceptions." A draft that skipped listing-level or attribute
validation would satisfy the first and violate the second. Asked the user
via AskUserQuestion, quoting both HARD RULEs; the answer was "drafts
require full validation too." `src/lib/listings/validate-submission.ts`
now has exactly one entry point (`validateListingSubmission`), called
identically by `createListing` and `updateListing` regardless of
`status`. The only differences between a draft save and a publish are:
(1) `checkListingLimitGate` is skipped entirely for a draft save/update,
and (2) the row's `status` value. There is no code path that persists a
partially-valid `listings` row.
**Revisit:** No — this is now the intended, permanent shape.

### 36. "List another" prefill includes `condition`, not just category and brand
**Why:** the task's own prose said "pre-fills brand from the seller's most
recent listing in that category," but PRD Epic B2 AC3 is explicit: "a
fresh form with category, brand, and condition prefilled from the just
published listing. All other fields empty. AC3 fails if the description
or photos carry over." Condition is enumerated by name in the AC; the
task's summary just compressed it out. Followed the AC's literal text —
low-stakes citation-style correction, not blocking. `handleListAnother` in
`listing-form.tsx` carries over `categorySlug`, `condition`, and
`attributeValues["brand"]` from current state; everything else — title,
description, price, condition_notes, photos, flaw indexes, every other
attribute — resets to empty.
**Revisit:** No.

### 37. AC6's "most recently used category" default is a separate mechanism from AC3's "list another" prefill, not the same feature
**Why:** the task's phrasing ("pre-selects the same category and pre-fills
brand from the seller's most recent listing in that category") reads as
one feature, but the PRD describes two: AC3 fires only right after a
publish, client-side, no DB query, carrying category+brand+condition from
the listing that was just published. AC6 fires on any fresh, unparameterized
`/sell` visit (no `?listing=`, no just-published state), server-side,
querying the seller's most recent listing by `created_at` for its category
only — no brand, no condition. Building one field (say, deriving AC6 from
AC3's client state) would silently violate the other's trigger condition.
Implemented both, literally: `page.tsx` does the AC6 query and passes
`defaultCategorySlug`; `listing-form.tsx`'s `handleListAnother` does the
AC3 carry-over entirely from in-memory state, no query.
**Revisit:** No.

### 38. `removeListing` doesn't check the listing's current `status` before setting it to `removed`
**Why:** PRD Epic B4 AC4/AC5 only require (a) it sets `status = 'removed'`
and (b) it's blocked while a non-`cancelled`/non-`expired` order exists —
neither AC restricts which prior status is eligible. Adding a
`status IN ('draft','published')` guard server-side would be an
unrequested restriction with no PRD backing, and `removed`/`sold` are
already excluded from every buyer-facing surface regardless (the existing
`listings_select_published` RLS policy only serves `published` rows
publicly), so re-removing an already-removed or already-sold listing is
inert, not harmful. The restriction lives in the UI instead:
`dashboard/listings/page.tsx` only renders the Remove button for `draft`
and `published` rows, since those are the only states where removing is a
meaningful seller action.
**Revisit:** No.

### 39. `useState(() => ...)` lazy initializers and a scoped `eslint-disable` for `react-hooks/set-state-in-effect`, not `useSyncExternalStore`, to satisfy Next 16's React Compiler lint rules
**Why:** Next.js 16's `eslint-config-next` bundles the React Compiler's
`react-hooks` v6 rule set, which is stricter than plain
`exhaustive-deps`. Two rules fired in `listing-form.tsx`: `purity` (calling
`Date.now()` directly in a `useState` initializer expression, which runs
on every render even though only the first result is kept — wrapping it in
a lazy initializer function fixed it, matching how `crypto.randomUUID()`
was already written elsewhere in the same file) and `set-state-in-effect`
(the localStorage-draft-restore effect calling several `setState`s
synchronously). For the latter, considered `useSyncExternalStore` — the
React-sanctioned way to read a synchronous external source without an
effect — but rejected it: it's designed for continuously-mirrored
read-only state, and every field it would seed here (`title`,
`condition`, etc.) must remain independently user-editable afterward,
which `useSyncExternalStore` doesn't support. Restoring state from
localStorage exactly once, post-hydration, is the textbook case effects
exist for; used a scoped `eslint-disable`/`eslint-enable` pair around just
those `setState` calls with a comment explaining why, rather than
restructuring seven independent controlled fields into one object purely
to satisfy the linter. Separately, replaced `window.location.href = ...`
(flagged by the compiler's immutability rule as a write to a
externally-owned object) with `useRouter().push()` from `next/navigation`
— strictly better anyway, since it avoids a full page reload after a
draft save.
**Revisit:** No, unless a future Next/React-Compiler version changes how
it wants one-time external-state hydration to be written.

---

## From Prompt 9

### 40. "Raised to the top of the moderation queue" needed no new column
**Why:** §9.3 point 3 says a detection raises the listing "to the top of the
moderation queue," which reads like it implies a priority flag on
`moderation_flags`. But Epic E1 AC1 (the future admin queue, not yet built)
already specifies "Lists open `moderation_flags` newest first" — a freshly
inserted flag is the top of a newest-first list purely by virtue of being
newest, with no additional column required. Adding an invented
`priority`/`is_priority` boolean would duplicate what `created_at` +
newest-first ordering already gives for free, and §7.1's `moderation_flags`
table doesn't define any such column.
**Revisit:** Only if Epic E1 is built with different ordering than "newest
first" (e.g. a genuinely separate priority lane for auto-detected flags vs.
user reports) — re-read this decision against whatever E1's actual spec
says at that point.

### 41. Contact-detail scanning fires on every `createListing`/`updateListing` call, drafts and repeat edits included, with no deduplication
**Why:** §9.3 says text is "scanned at submission" without narrowing that to
publish only — a draft save is still a submission of listing text, and
catching leakage as early as possible is strictly better under a
recall-favoring design. For edits, a seller could in principle trigger a new
flag on the same listing on every save if the offending text persists
unchanged; deliberately not deduplicated against prior flags, since a
repeat detection is itself the signal §9.3 point 5 describes ("suspends the
listing on repeat offence") — collapsing repeats into one flag would erase
exactly the evidence a moderator needs to tell a one-off slip from a
repeat offender.
**Revisit:** No, unless a future prompt's moderation-queue design
specifically wants deduplicated flags (e.g. one open flag per listing,
updated in place) rather than one row per detection event — that would be
a deliberate scope change to the queue's data model, not a fix to this
prompt's behavior.

---

## From Prompt 10

### 42. Category attribute filters scoped to `enum`/`boolean` registry fields only — no numeric range filtering
**Why:** §10 Epic C1 AC5 requires attribute filters to "query the GIN index
on `attributes` with `category_id` already applied." The only index that
exists on `attributes` is a plain `gin(attributes)` (`jsonb_ops`), which
accelerates containment (`@>`) and existence operators — not range
comparisons on an extracted value. `enum` fields (exact match) and
`boolean` fields both map cleanly to `attributes @> {"field": value}`,
which the GIN index serves directly. A numeric range filter (e.g.
`battery_health_percent >= 80`) would need `(attributes->>'field')::numeric
>= 80`, which does not use this index — building that filter would
either violate AC5's literal requirement or need a different index
shape the PRD doesn't specify. Scoped out rather than shipped
non-compliant.
**Revisit:** If a future prompt adds a numeric-range-capable index (e.g. a
per-field expression index, or promoting a specific attribute to a real
column per §6.1's stated escape hatch), re-open this and add range filters
for that field specifically — not by broadening this general mechanism.

### 43. `database.types.ts` swapped from hand-authored to genuinely CLI-generated
**Why:** this prompt's `search_listings` RPC needed a correctly typed
signature, which the hand-authored file couldn't have (it predates the
function). Docker has been available since the session before this one
(see the grants-fix and Prompt 9 sessions), so regenerating for real was
finally possible — this was the first prompt that actually *needed* the
regenerated output, making it the natural moment to complete the swap the
file's own header comment had been promising since Prompt 2. Diffed
against the previous hand-authored version first: every table's
Row/Insert/Update shape matched field-for-field. Two differences, both
now correctly present: (a) every view column (`profiles_public`,
`ratings_public`) is nullable in the generated types, since Postgres
doesn't reliably propagate `NOT NULL` through views — the hand-authored
version had incorrectly assumed base-table non-null survived the view;
(b) the `Relationships` arrays are fuller — duplicate entries pointing at
`_public` views alongside base tables (e.g. `ratings.rater_id` resolves to
both `profiles` and `profiles_public`), which the hand-authored version
didn't attempt to replicate by hand.
**Revisit:** No — this is now the real, CLI-generated file. Regenerate and
commit it alongside every future migration, per the README's own HARD
RULE; never hand-edit it again.

---

## From Prompt 11

### 44. `profiles_public` widened to expose `dispute_upheld_count`
**Why:** the listing-detail reputation block (§10 Epic C3 AC5) needs
dispute rate (`dispute_upheld_count / completed_sales_count`, shown only
once `completed_sales_count >= 5`), and the view didn't carry the numerator.
Decision #1 (Prompt 2) deliberately excluded it at the time but explicitly
named this exact moment in its own "Revisit" note: "When Epic C … is
built — confirm the view's column list covers what C3 AC5 / C4 need." New
migration `20260729080000_profiles_public_dispute_rate.sql` adds the column
via `create or replace view`, appended at the end (Postgres rejects
reordering/inserting a column before the view's existing last column —
hit this the first time and fixed the column order). Same gating pattern as
`rating_count`/`rating_average`: the raw count is exposed; the `>=5`
threshold is applied by the caller (`SellerReputationBlock`), not the view.
**Revisit:** No.

### 45. `listings` RLS widened to allow public read of `status = 'sold'`, not just `'published'`
**Why:** discovered while building this prompt, not asked for by the task.
§10 Epic C3 AC6 requires "sold listings display as sold and are not
purchasable" — which only makes sense if a buyer can still reach a sold
listing's detail page (e.g. an old shared link). The original
`listings_select_published` policy (Prompt 4) only allowed
`status = 'published'`, so a sold listing would 404 for every non-owner,
contradicting AC6's literal requirement. New migration
`20260729080500_listings_select_sold.sql` replaces the policy with one
allowing `status in ('published', 'sold')`. No other status (draft,
removed, suspended) is public — verified live: a freshly inserted `draft`
listing is invisible to the anon client and 404s on `/l/[id]`.
**Revisit:** No, unless a future status value needs the same treatment —
apply the same reasoning (does a buyer legitimately need to reach this
listing's detail page after the fact?), not a blanket relaxation.

### 46. `adminOnlyAttributeFields` added to the category registry, populated only for Gadgets (`imei_last_6`)
**Why:** §7.1/§9.1 require `imei_last_6` never reach a non-admin response.
Rather than a hardcoded field-name check in the listing-detail query (which
would be exactly the kind of per-category special case §12.3 forbids),
it's registry metadata, same shape as `usageIndicatorFields` (Decision
#33) — `getListingDetail` strips every category's declared admin-only
fields generically, by name, before the attributes object leaves the data
layer. Stripped at the query layer, not just skipped at render time, so it
never enters the RSC payload at all, not only the visible HTML. Verified
live: neither `imei` nor the seeded IMEI value appears anywhere in the
rendered page's HTML or RSC flight payload.
**Revisit:** Yes, if a future category attribute needs the same treatment —
add it to that category's `..._ADMIN_ONLY_ATTRIBUTE_FIELDS` export and
registry entry; the stripping mechanism itself needs no changes.

### 47. Generic, field-name-keyed attribute display (`src/lib/categories/attribute-display.ts`) — no category switch
**Why:** §10 Epic C3 AC3 explicitly fails if rendering is hardcoded per
category, but §6.4.3's two-claims rule (functional_status/cosmetic_grade
equal prominence to condition) and §6.4.1/§6.4.4's remaining-PAO
computation are real, category-specific-sounding requirements. Resolved by
keying every special case on a *field name* or *field kind* that recurs
verbatim across categories rather than on category slug: `functional_status`
is spelled identically in Gadgets (§6.4.3) and Home Goods (§6.4.5);
`pao_months`/`opened_at_date` are spelled identically in Beauty (§6.4.1)
and Personal Care (§6.4.4); any object-kind field (Fashion's
`measurements_cm`) gets its own sub-table with the unit suffix inherited
from the parent field's own name (`_cm`) rather than needing it on each
sub-key. A real bug here, caught by live verification rather than by
inspection: the first version derived a sub-value's unit from the
*sub-field's* name (`chest`, `length`, …), which don't carry a `_cm`
suffix themselves — only the parent object does — so measurements
rendered as bare unlabelled numbers until fixed to inherit the parent's
suffix.
**Revisit:** No, unless a sixth category introduces a field name that
collides with one of these generic rules but means something different —
unlikely given the registry's existing naming discipline, but worth a
second look if it happens.

### 48. `referrer_surface` inferred from the `Referer` request header, not a `?ref=` query param threaded through every `ListingCard` caller
**Why:** `listing_viewed`'s `referrer_surface` property (§3.5) needs to
know which surface linked to this listing. `ListingCard` is used from three
existing call sites (category page, search, home page's recently-listed)
plus, per Epic C4 next prompt, a fourth (seller profile) — threading a
query param through all of them would touch files well outside this
prompt's stated scope ("C3 only"). Reading `headers().get("referer")` in
the page itself and mapping known paths (`/`, `/c/*`, `/search`, `/s/*`,
`/l/*`) to surface names achieves the same property with zero changes to
`ListingCard` or any of its callers. Verified live: a request with
`Referer: /c/beauty` logs `referrer_surface: "category_page"`; a bare
request logs `"direct"`.
**Revisit:** If a future prompt wants a more precise signal than the
Referer header provides (e.g. distinguishing "recently listed on the home
page" from "the home page's category grid"), that's the point to switch to
an explicit `?ref=` param — not a sign this decision was wrong at the time.

### 49. Support route built as a `mailto:` link, and the task's "known_faults"/"hygiene notices" wording narrowed to what the schema actually models
**Why, support route:** §5.2's out-of-scope list is explicit: "In app
support ticketing. The support route is a contact link in MVP" — so a
`mailto:` link (new `NEXT_PUBLIC_SUPPORT_EMAIL` env var) is the correct
MVP shape, not a ticket form. A small `"use client"` component
(`SupportLink`) exists solely to fire `support_contact_opened` on click;
every other part of this page stays a Server Component.
**Why, "known_faults":** no category schema has a field by this name —
closest match is the shared `condition_notes` field (required, ≥20 chars,
on `used`), which is where a seller would actually describe faults.
Rendered in full, no truncation, no line-clamp, under its own "Seller's
notes on condition" heading.
**Why, "hygiene notices":** no persisted hygiene-notice field exists in
the data model either. Narrowed to what's actually generic and
registry-derivable: nothing was added beyond the condition/attribute
rendering already built, since Personal Care's category-wide "used is
disallowed" policy is already visible structurally (its condition selector
has no third option, and `PERSONAL_CARE_ALLOWED_CONDITIONS` excludes
`used` — Decision from Prompt 3). A per-listing badge keyed on Beauty's
hygiene-sensitive product types (mascara, lipstick, …) was considered and
deliberately not built: it isn't in this prompt's VERIFICATION list, the
task's own wording doesn't name a field to derive it from, and inventing
one would risk exactly the kind of unrequested per-category logic §12.3
warns against.
**Revisit:** the hygiene-notice narrowing, yes, if a future prompt wants an
explicit per-listing hygiene badge — that's a deliberate scope addition
with its own registry field (following Decision #46's pattern), not a
correction of this one.

### 50. Seller reputation built as two reusable modules, not inlined into the listing-detail page
**Why:** the task itself asked for this — Epic C4 (seller public profile,
next prompt) needs the identical reputation block per its own AC3
("Shows the reputation block per C3 AC5"). `src/lib/reputation/
get-seller-reputation.ts` (the query, wrapped in React's `cache()`) and
`src/components/reputation/seller-reputation-block.tsx` (the
presentation, a pure Server Component taking a `SellerReputation` prop)
have zero listing-specific knowledge — Prompt 12 imports both as-is.
**Revisit:** No, unless C4 surfaces a rendering difference between the two
surfaces not anticipated here — in which case extend the component with an
explicit prop, don't fork it.

---

## From the post-Prompt-11 QA session

### 51. A real-browser QA pass (gstack `/qa`) found zero application bugs in Prompts 10/11's buyer-facing surface — two non-bugs documented, not fixed
**Why this is worth a durable entry, not just a report:** everything up to
this point verifying Epic C1–C3 had been done by curl, unit test, or direct
Postgres query — real but not the same as an actual browser clicking
through actual links. This session closed that gap independently: home
page, `/c/beauty`, `/search`, and `/l/[id]` (both a `browsable` and a
non-`browsable` listing) were exercised in a real headless-controlled
browser. Result: every flow worked as designed, including the three-legged
browsable gate (nav-absent / search-findable / direct-link-reachable) and,
notably, `support_contact_opened` actually firing on a real click — the one
thing Prompt 11 itself had explicitly flagged as read-for-correctness-only,
never click-tested (Decision #49/#50's session).
**The two things found, and why neither is a fix:**
1. Repeated `400`s loading listing photos — traced to Prompt 11's own seed
   script inserting placeholder Storage URLs with no file behind them
   (confirmed by curling the raw Storage URL directly: same 400).
   `next/image` degrades correctly regardless (alt text, zero layout
   shift). Would not occur with a photo uploaded through the real `/sell`
   flow, which only ever writes a URL after a confirmed successful upload.
2. gstack's own `browse` tool's `snapshot -a` (annotate) fails on
   `/c/beauty` — traced to the page's several attribute-filter `<select>`s
   each carrying an identically-labelled default option ("Any"), valid
   ordinary HTML (confirmed zero duplicate DOM `id`s on the page). A
   testing-tool limitation, not an application defect; logged as a gstack
   learning rather than changed here.
**Revisit:** No — this is a point-in-time verification record. If a future
session finds an actual bug in this surface, log it in `docs/KNOWN_ISSUES.md`
as its own item, not by editing this entry.
