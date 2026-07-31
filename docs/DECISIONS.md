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

---

## From Prompt 12

### 52. Seller avatar rendered with a plain `<img>`, not `next/image`
**Why:** `avatar_url` (`src/lib/validation/index.ts`'s `avatarUrl` field) is
arbitrary seller-supplied input — any URL that passes `z.string().url()`, not
a value constrained to Supabase Storage the way every listing photo is.
`next.config.ts`'s `images.remotePatterns` allowlists only Supabase Storage
hosts (Decision from Prompt 7/10's `next.config.ts` comment); `next/image`
throws at request time for any host not on that list. Widening the allowlist
to arbitrary external hosts to support this one field would be a real
security/abuse-surface tradeoff (SSRF-adjacent image-proxy exposure to any
URL a seller types) that this prompt's scope doesn't call for. A plain
`<img>` with `loading="lazy"` (the browser default, not `next/image`'s
optimization pipeline) avoids the tradeoff entirely; a missing avatar falls
back to a plain initial-letter circle, matching the "never render a new or
incomplete seller negatively" spirit already governing the reputation block.
**Revisit:** If a future prompt moves avatar upload onto the same
Storage-bucket pattern as listing photos (client-side upload,
`getPublicUrl`, no arbitrary external URL ever accepted), switch this back
to `next/image` at that point — the constraint that currently rules it out
would no longer hold.

### 53. Reviews section paginates all non-hidden, review-bearing ratings; the reputation block's "recent reviews" stays capped at 3
**Why:** the prompt brief asks for both — the reputation block reused
exactly as Prompt 11 built it (Decision #50, capped at 3, no changes) and a
separate, paginated "the seller's received ratings/reviews (non-hidden)"
section. Rather than invent a second filtering rule for the paginated list,
`get-seller-reviews.ts` uses the identical filter `get-seller-reputation.ts`
already applies to its `recentReviews` (`is_hidden = false`, `review is not
null`) and the identical `SellerReview` type — the paginated list is
literally "the same query, unbounded and paged" rather than a
independently-designed second view of the same table. `ratings_public`
already exposes every row with `review` nulled server-side when hidden
(Decision #24) and non-hidden rows otherwise intact; filtering to
`is_hidden = false` here matches that view's own public-read intent rather
than re-deriving a different visibility rule for this one page.
**Revisit:** No, unless a future prompt wants the paginated list to also
surface score-only ratings with no written review text (currently excluded,
consistent with `recentReviews`) — that would be a deliberate broadening of
what counts as a displayable "review," not a fix to this decision.

---

## From Prompt 13

### 54. `orders.listing_id`'s blanket `UNIQUE` constraint replaced with a partial unique index scoped to active statuses; no `delivery_city` field
**Why, the index:** §10 Epic D1 AC8 says a listing "already having a non
`cancelled`, non `expired` order cannot enter checkout... the UNIQUE
constraint on `orders.listing_id` is the enforcement." AC9 says an expired
`pending` order "frees the listing." Prompt 5 built `orders.listing_id` as a
literal, unconditional `UNIQUE` column constraint straight from §7.1's
table — correct at the time (Epic D didn't exist yet to expose the
tension), but a blanket `UNIQUE` cannot express "unique only while active":
once any order ever existed for a listing, no second order could ever be
inserted for that `listing_id` again, even after the first resolved to
`cancelled`/`expired` — permanently blocking every future purchase on that
listing after a single expired checkout, directly contradicting AC9's
"freeing the listing." A partial unique index
(`create unique index ... where status not in ('cancelled', 'expired')`) is
the standard Postgres mechanism for exactly this — unique among active
rows, freed the instant a row exits that set. Verified live: two `pending`
orders for the same listing conflict; a second becomes insertable the
instant the first is updated to `expired`. `hasBlockingOrder`
(`src/lib/listings/has-blocking-order.ts`, Prompt 8) had to be fixed
alongside this — it previously used `.maybeSingle()` on the assumption of
at most one order row per listing, which the partial index's very premise
(a listing can now hold more than one order row over its lifetime) breaks.
**Why, no `delivery_city`:** the checkout brief's own item list named five
delivery fields including `delivery_city`; grepped §7.1's `orders` table
and §9.1's contact-release list for `delivery_city` — zero hits in either,
only four fields (`delivery_name`, `delivery_state`, `delivery_address`,
`delivery_phone`) exist anywhere in the PRD. Resolved in favor of the PRD's
actual schema — a full street address is expected to carry the city
inline, same as it already must for every other address component.
**Revisit:** No — this is now the correct, permanent shape for both.

### 55. A `pending` order whose Paystack `initialize` call fails is deleted, not left pending
**Why:** this order never reached Paystack — no `paystack_reference` was
ever issued, so no real payment attempt was ever shown to the buyer. The
30-minute expiry cron (§10 Epic D1 AC9, `/api/cron/expire-pending-orders`)
is explicitly out of this prompt's stated scope and does not exist yet;
without deleting the row here, a single transient Paystack failure (a
network blip, a misconfigured key, a Paystack outage) would permanently
lock the listing behind `orders_listing_id_active_unique` (Decision #54)
with zero recovery path until that cron is eventually built. Deleting a
row that never had a reference and never represented a real attempt isn't
destroying an audit trail — the trail starts at a stored
`paystack_reference`, which this row never got. Best-effort: if the delete
itself fails, the leftover row is easy to identify (no
`paystack_reference`) and harmless, and gets cleaned up once the expiry
cron exists.
**Revisit:** Yes, once `/api/cron/expire-pending-orders` is built — at that
point, re-examine whether this delete-on-failure path is still needed or
whether it's now redundant with the cron (it's likely still worth keeping,
since it gives an *immediate* retry rather than making a buyer wait up to
30 minutes after a transient failure, but that's a call for whoever builds
the cron, informed by what actually ships).

### 56. `initiateCheckout` keeps its own `!user.email_confirmed_at` check even though this project's auth config makes it currently unreachable
**Why:** empirically confirmed (a direct `password`-grant request against
the local GoTrue instance for a deliberately-unconfirmed test account)
that `supabase/config.toml`'s `[auth.email] enable_confirmations = true`
blocks sign-in entirely pre-confirmation — a session cannot exist in this
app without an already-confirmed email. That makes §10 Epic D1 AC1's
"buying requires... a verified email" check technically dead code today:
if `user` exists in `initiateCheckout`, `email_confirmed_at` is already
guaranteed non-null by construction. Kept anyway, for three reasons: (1)
it's the literal text of the AC, not an inference from other config; (2)
it's zero runtime cost; (3) defense-in-depth against a future change to
`enable_confirmations`, or a different future auth path (magic link,
OAuth, admin-created sessions) that might not enforce the same gate —
matching this codebase's established pattern of re-checking a condition in
application code even where another layer currently also guarantees it
(e.g. Prompt 4's `flaw_photo_indexes` CHECK constraint alongside Zod).
**Revisit:** Only if a future prompt adds an auth path that doesn't route
through GoTrue's own confirmation gate — at that point this stops being
unreachable and the reasoning above should be re-read against the new
path, not removed.

---

## From Prompt 14

### 57. There is no `PAYSTACK_WEBHOOK_SECRET` — webhook signatures are verified with `PAYSTACK_SECRET_KEY`
**Why:** the PRD's own §12.4 ("Paystack secret and public keys, Paystack
webhook secret...") and the Prompt-1 scaffold's `.env.local.example` both
assumed Paystack issues a distinct, per-endpoint webhook-signing secret —
the shape Stripe uses (`whsec_...`). Checked against Paystack's own
documentation before building anything (not assumed): *"the
`x-paystack-signature` header... contains a HMAC SHA512 signature of the
event payload signed using your secret key."* Paystack has no separate
signing secret at all; the account's own `sk_test_.../sk_live_...` key is
the HMAC key for both `/transaction/initialize` calls and inbound webhook
verification. Resolved in favor of what Paystack actually does, not what
the PRD assumed a payments provider does in general. Removed the
`PAYSTACK_WEBHOOK_SECRET` line from `.env.local.example` and the matching
line from `README.md`'s HARD RULE callout — leaving it in place would have
been actively misleading (a real value someone might set there is simply
never read by anything).
**Revisit:** No, unless Paystack itself introduces a genuine per-endpoint
signing secret in the future — re-verify against their docs at that point
rather than assuming this decision is stale.

### 58. Amount/reference mismatch has no dedicated admin-flag table — surfaced via `webhook_events.processed_at IS NULL`
**Why:** §10 Epic D2 AC4 says a mismatch "creates an admin flag," but no
PRD table fits this. `moderation_flags` (§9.3) is scoped to listing
content moderation — its `source` enum (`auto_contact_detect`,
`user_report`, `admin`) and Epic E1's own ACs (AC2: "dismiss, or suspend
the listing") have no meaningful action for a payment-integrity anomaly; a
payment discrepancy isn't something a moderator "dismisses or suspends a
listing" over. `disputes` doesn't fit either — structurally, disputes
require the order to already be `paid`/`shipped`/`delivered` (§8.1 HARD
RULE), and this order is by definition *not* transitioning to `paid`.
Rather than force-fit an ill-suited table or invent a new one the PRD
doesn't specify, a mismatch leaves the already-inserted `webhook_events`
row's `processed_at` column `null` — every other terminal outcome in the
handler (wrong event type, order not found, already-non-pending) sets it —
so `select * from webhook_events where processed_at is null` is a precise,
queryable signal for exactly this class of anomaly, using only columns the
table already has. Paired with a structured `console.error` at the moment
of detection for immediate visibility. Also applied to a second, cheap
check beyond AC4's literal ask: the webhook's `data.reference` is compared
against the order's own stored `paystack_reference` (set once, right after
`initialize`, Prompt 13) — same class of "don't trust it blindly" concern,
same flagged-not-transitioned treatment.
**Revisit:** Yes, when Epic E1 (or a dedicated admin alerting surface) is
actually built — at that point, decide deliberately whether payment
anomalies get their own table/queue or whether querying
`webhook_events.processed_at IS NULL` is genuinely sufficient long-term.
Don't let this stay the permanent answer by default.

### 59. No `order_events` table; `order_paid` fires with `is_repeat_buyer`, not `buyer_order_ordinal`
**Why:** this prompt's own item list asked for "an `order_events` row
(actor_role system)" and an `order_paid` event carrying
"`buyer_order_ordinal`" — grepped the whole PRD for both terms, zero hits
anywhere outside this prompt's own instructions. `order_events` is the
exact same invented table Prompt 5 already rejected in favor of `disputes`
(Decision #21) — building it now would directly contradict that resolved
decision. `buyer_order_ordinal` doesn't exist in §3.5's event table at
all; the actual `order_paid` properties listed there are `order_id`,
`listing_id`, `category_id`, `amount_kobo`, `commission_kobo`,
`is_repeat_buyer` — and §10 Epic D2 AC5 independently confirms
`is_repeat_buyer`, "computed from prior released orders by that buyer," by
name. Same shape as Prompt 6's `seller_listing_ordinal` invention
(Decision #26) — resolved the same way, in favor of the PRD's literal
text, without needing to ask this time since the precedent is now
well-established. The audit trail the task item was reaching for with
"`order_events`" already exists without a new table: `orders.paid_at`
(set once, by `mark_order_paid`, never touched again) records *when*, and
`webhook_events.payload` (the verbatim raw Paystack event, retained
permanently) records *what triggered it* — together a complete, queryable
record of the transition with no redundant table.
**Revisit:** No — this is the second time this exact class of
task-brief-vs-PRD mismatch has come up (Decisions #21, #26); the pattern
is settled. If a future prompt's brief invents another table/property name
not found by grepping the PRD, resolve in favor of the PRD the same way,
document it, and don't ask again unless it's a genuine two-HARD-RULE
conflict (the shape Decision #35 was).

### 60. `mark_order_paid` is a plain (non-`SECURITY DEFINER`) Postgres function with `EXECUTE` explicitly revoked from `public`/`anon`/`authenticated`
**Why:** §8.1's HARD RULE — "`paid` is entered by the Paystack webhook and
by nothing else" — is this prompt's central security requirement, and the
PRD explicitly frames this whole prompt as "the single most
security-sensitive piece of the build." Supabase-js has no multi-table
transaction primitive across separate `.from()` calls, so the atomic
order→paid + listing→sold write (§8.1's second HARD RULE, §10 Epic D2 AC3)
has to be a single Postgres function call. Every function in this schema
is `PUBLIC`-executable by Postgres's own default unless explicitly
revoked — confirmed empirically when `search_listings` was built (Prompt
10's migration comment) and re-confirmed here (a plain `anon`-role RPC
call against `mark_order_paid` returns `permission denied for function
mark_order_paid` only *because* the REVOKE below exists). Not `SECURITY
DEFINER`: the only intended caller is the webhook route via the
service-role client, which already has full table access with no RLS
applied — no privilege elevation is needed *inside* the function, only
outside it (who may call it at all). `revoke execute on function
mark_order_paid(uuid) from public, anon, authenticated; grant execute ...
to service_role;` is not decorative — without it, any authenticated
client could call this RPC directly via the Supabase JS SDK and transition
an arbitrary order to `paid`, trivially violating the HARD RULE this
entire prompt exists to enforce. Verified live before writing a single
line of the route handler: the grant-restricted state was confirmed via
`information_schema.routine_privileges` and by an actual rejected `anon`
RPC call, not assumed from reading the migration.
**Revisit:** No — this is the correct, permanent shape. If a future prompt
ever needs a second caller (e.g. an admin action that also transitions
orders), grant `EXECUTE` to that specific, narrow context — never widen
back to the Postgres default.

---

## From Prompt 15

### 61. `delivered` is a real, persisting state; release happens via buyer early-release or a 72-hour auto-release, never in the same instant as delivery confirmation
**Why:** a genuine conflict, surfaced before writing any code and resolved
via AskUserQuestion rather than guessed — §10 Epic D4 AC2's literal text
("`delivered` transitions immediately to `released`, `released_at` set")
reads as zero elapsed time, ever. But §10 Epic D5 AC1 says a dispute "may
be raised on... `delivered`, within 7 days of `delivered_at`... whichever
is first" — which only makes sense if an order can actually sit in
`delivered` status long enough for someone to act on it. If AC2 meant
literally instantaneous, no order would ever be observably `delivered`
before becoming `released` (and D5 AC7: "once released, the dispute action
is not available"), making D5 AC1's "delivered" branch permanently dead.
Resolved by reading AC2's "immediately" as "automatic, no admin-approval
gate" (contrasted with a hypothetical manual-release design, matching how
AC3 separately emphasizes "AC3 fails if the payout row is created by an
admin action") rather than "zero elapsed time" — this is the interpretation
the user chose. The specific window (72 hours) is **not sourced anywhere in
the PRD** — grepped every occurrence of "72 hour," all are about unrelated
KPIs (shipping-speed falsifiers, rating-reminder emails). It comes from
this prompt's own task brief and is documented here as an explicit,
flagged assumption, not a PRD citation, centralized in
`src/lib/orders/timing-config.ts`'s `DELIVERED_AUTO_RELEASE_HOURS`.
**Revisit:** the 72-hour figure specifically, if the PRD is ever amended to
state one explicitly — until then, this is the agreed value, not a
placeholder to silently drift away from.

### 62. `order_status_transitions` (audit table) and `orders_participant_view` (privacy gate) both built despite not being in PRD §7.1
**Why, the audit table:** grepped the whole PRD for "audit"/"transition
log"/"order_events" — zero hits, same finding as Decisions #21/#59. Built
anyway, unlike those two prior invented-table cases, because this prompt's
own instructions are qualitatively different: not a single passing mention
buried in a longer list (Prompt 14's "order_events" bullet), but three
separate, explicit statements ("every state transition is recorded... no
exceptions", "records the transition" as its own bullet for both
`markShipped` and `confirmDelivery`, "a transition without an audit record
is a bug"). More importantly, there's a genuine structural gap the
existing `orders` timestamp columns cannot close: §8.1's own state table
lists `delivered` as enterable by "Buyer, or auto release" — two different
actors that would set the identical `delivered_at` column, with nothing to
tell them apart afterward. `expired` and `cancelled` have no dedicated
timestamp column on `orders` at all, so for those, this table is the
*only* timing record, not merely a supplementary actor record. Every
insert happens inside the same atomic function as the state change itself
(`mark_order_shipped`, `confirm_order_delivered`, `release_order`,
`expire_pending_order`, `auto_advance_shipped_to_delivered` — all in
`20260729110000_order_transitions.sql`), matching `mark_order_paid`'s
established shape (Decision #60): `WHERE status = <expected prior
status>` is itself the "only allowed §8 transitions may occur" enforcement,
atomically, with no separate pre-check-then-write race window.
**Why, the view:** closes Known Issue #14 (open since Prompt 5, deferred
through Prompts 13/14 for lack of a real consumer to design it against).
Same "public-column-privacy pattern" as `profiles_public`/`ratings_public`
(Decisions #1/#24) — RLS is row-level only and cannot express "hide column
X on this row unless status = Y," so a view does the column-level masking
RLS structurally can't. Only the seller's view of the buyer's `delivery_*`
columns is gated pre-`paid`; the buyer always sees her own submitted data,
since hiding it from herself protects nothing §9.1 is actually concerned
with. Verified live from all four angles: seller sees `null` on a
`pending` order, sees real values once `paid`, buyer always sees her own
values regardless of status, and an anonymous request is flatly denied
(`permission denied for view`, since only `authenticated` was granted
`SELECT`, not `anon`).
**Revisit:** No for either — these are now the permanent mechanisms.

### 63. Cron routes export both `GET` and `POST` handlers
**Why:** checked Vercel's own documentation before building (not assumed):
"Vercel makes an HTTP GET request to your project's production deployment
URL" to trigger a cron job — this is Vercel's actual, native invocation
mechanism. PRD §11.1's own route table lists these two routes as `POST`.
Rather than gamble on which is authoritative for the deployed environment
(and risk cron jobs silently 405ing in production, never firing, with no
obvious symptom until orders pile up unprocessed), both methods are wired
to the identical handler function. The `Authorization: Bearer
$CRON_SECRET` header Vercel sends is identical regardless of method, so
`isAuthorizedCronRequest` needs no method-specific logic.
**Revisit:** No — low cost, meaningfully de-risks a silent production
failure mode. If Vercel's behavior is ever confirmed to have changed,
revisit then, not preemptively.

### 64. A missing table-level `GRANT` on `order_status_transitions` was caught live, not by inspection — the exact bug class this project already has a name for
**Why this is worth its own entry, not just a bugfix note:** the
un-numbered grants-fix session (between Prompts 8 and 9) already
discovered and documented, project-wide, that Postgres checks table-level
grants *before* evaluating RLS — a correct RLS policy with no matching
`GRANT` still denies everything. `docs/PROJECT_STATUS.md` §4 has carried
"Table GRANTs are not optional even with correct RLS" as a standing
architectural note ever since. Despite that precedent being fully written
down, `order_status_transitions`'s own migration
(`20260729110000_order_transitions.sql`) still shipped without the
`GRANT SELECT ... TO authenticated` line — caught only because this
prompt's live verification actually queried the table as a real
`authenticated` session (`permission denied for table
order_status_transitions`, with Postgres's own hint literally spelling out
the fix), not because the precedent was re-read at write time. Fixed
immediately, both live (direct `GRANT`) and in the migration file itself
before commit — the file in git now matches what's actually running, per
this project's own HARD RULE that the SQL is committed, not patched ad hoc
against a dashboard.
**Revisit:** No fix needed beyond what's done. Worth internalizing as a
literal checklist item — *every* new table/view this project adds needs an
explicit grep for "grant select" in its own migration before being
considered done, not just a mental note that the precedent exists.

### 65. `mark_order_paid` (Prompt 14) retrofitted to also write an `order_status_transitions` row
**Why:** `order_status_transitions` didn't exist when Prompt 14 shipped, so
the very first transition in the order lifecycle (`pending` -> `paid`) was
the one gap left once this prompt made every other transition audit-
recorded. Given this prompt's own repeated, explicit "no exceptions"
instruction, leaving the first transition unrecorded purely because the
table postdates the code performing it would itself be exactly the kind of
exception that instruction exists to close. `paid_at` +
`webhook_events.payload` already gave this transition *some* durable
record (Decision #59's reasoning stands — this isn't a reversal of that,
just an addition), so this is about consistency across the full lifecycle,
not a claim the old mechanism was ever wrong. Implemented as a **new**
migration (`20260729130000_mark_order_paid_audit_trail.sql`) that
`CREATE OR REPLACE`s the existing function — the already-applied,
already-pushed `20260729100000_mark_order_paid_function.sql` is never
edited in place, same discipline this project has followed for every
prior in-place function/policy change (e.g. Decision #45's widened RLS
policy, its own new migration rather than a rewrite of Prompt 4's). Grants
re-stated explicitly rather than assumed to survive `CREATE OR REPLACE`
untouched. Verified live: a fresh signed webhook payload now produces both
the expected `paid` transition *and* a `pending -> paid` row in
`order_status_transitions` with `actor_role: 'system'`.
**Revisit:** No — this is the correct, permanent, complete shape for the
whole order lifecycle's audit trail.

---

## From the post-Prompt-15 QA session

### 66. Image-host validation is a single shared module, enforced at both the write boundary and every render site — not just one or the other
**Why:** a full-browser QA pass walking the real purchase journey (buy →
signed-webhook-replay → ship → deliver → release) found that a listing
photo URL outside `next.config.ts`'s `images.remotePatterns` allowlist
doesn't degrade per-image — `next/image` throws synchronously during
render, which 500'd the *entire* home page (every listing in "Recently
listed" renders on that one request), not just the offending card. This
was triggered by leftover QA-fixture data, but nothing in the actual write
path prevented it: `createListing`/`updateListing` never checked a photo
URL's host against the configured allowlist before persisting it.
Fixing only the write path would have left existing/externally-written
bad data (exactly what triggered this) able to crash the page again;
fixing only the render path would have left the schema silently accepting
URLs it can never safely display. Both were needed, and both needed to
agree on the *same* allowlist as `next.config.ts` itself, so a new shared
module (`src/lib/images/allowed-hosts.ts`, `isAllowedImageUrl()` /
`getAllowedImageHosts()`) became the single source of truth: `next.config.ts`
now derives `remotePatterns` from it instead of a hand-duplicated array,
`src/lib/listings/schema.ts` rejects a non-allowlisted photo URL via a Zod
`.refine()` (closing the write path), and `ListingCard`/`PhotoGallery`
both check the URL before ever handing it to `next/image` (closing the
render path for data that predates or bypasses the write guard — the
layer that actually stops the crash for data already in the database).
`PhotoGallery` deliberately doesn't filter the `photoUrls` array to drop
bad entries — `flawPhotoIndexes` indexes into the original array position,
so a skipped photo renders an empty slot rather than shifting every later
index's flaw tag onto the wrong photo.
**Verified live, not just by the new unit tests:** a listing with
`photo_urls: ["https://example.com/..."]` was inserted directly via the
database (bypassing the app, to specifically exercise the render-path
guard against pre-existing bad data rather than data the write guard would
now reject) — the home page returned `200` and rendered the listing
normally with an empty photo placeholder, exactly the existing "no photo"
state, not a crash.
**Revisit:** No, unless a future prompt adds a second `next/image`-rendering
surface for listing photos outside `ListingCard`/`PhotoGallery` — that
surface must import the same `isAllowedImageUrl` guard, never re-derive
its own allowlist check.

---

## From Prompt 16

Routed through `/plan-eng-review` before any code was written, given this
touches the atomic order-lifecycle RPCs (Prompt 15) and the money-release
path directly. Four architecture decisions below were surfaced and resolved
via AskUserQuestion; an independent outside-voice pass (Claude subagent —
Codex CLI not installed) then caught a real gap in Decision #70 below that
the review itself had missed. Full design doc + review report:
`~/.gstack/projects/slinkiest-web-URS2CASH/bon-main-design-20260730-180110.md`.

### 67. `payouts.payout_account_id` made nullable, deviating from PRD §7.1's literal `NOT NULL`
**Why:** §10 Epic D4 AC4 requires creating the queued payout row even when
the seller has **zero** `payout_accounts` rows at all (not just an
unverified one) — there's nothing to reference in that case, and nothing
in the schema forces every seller to have a row (a seller who never added
bank details has none). PRD §7.1's literal table and the original
migration (Prompt 5) both specify `NOT NULL`. Same class of deliberate,
flagged deviation as Decision #54 (`orders.listing_id`'s blanket `UNIQUE`)
— surfaced via `/plan-eng-review` before writing any code, not silently
changed. `release_order()` (Decision #70) inserts `NULL` when the seller
has no verified `payout_accounts` row.
**Revisit:** No — this is the correct, permanent shape for AC4's literal
requirement.

### 68. `payouts.is_blocked` is a snapshotted boolean, computed once at insert time — not a derived join, not a new flags table
**Why:** §10 Epic D4 AC4 requires the payout be "flagged in admin as
blocked" when the seller has no verified account, but Epic E (admin)
doesn't exist yet, so "flagged in admin" needed a concrete, minimal
interpretation — same class of judgment call as Decision #58's
amount-mismatch flag. Considered deriving "blocked" via a join at every
read site (`payout_account_id IS NULL OR NOT payout_accounts.is_verified`)
instead of a new column — rejected because it requires every future
consumer to remember the join logic, and this schema already has an
established, repeatedly-used pattern of snapshotting facts at creation
time rather than recomputing them (`commission_kobo`, `seller_payout_kobo`,
§8.3). `release_order()` computes `is_blocked` once, at the moment the
payout row is created, directly serving §10 Epic E3 AC2's future "visually
flagged and not actionable" with a plain `WHERE is_blocked` — no join
required. Known, accepted tradeoff: if a seller verifies their account
*after* this payout row already exists, the snapshot does not retroactively
flip — identical behavior to every other snapshotted column in this
schema.
**Revisit:** No, unless a future prompt decides snapshotted-at-creation is
wrong for this specific column (e.g. Epic E3 needs it to reflect current
verification status, not creation-time status) — that would be a
deliberate reversal, not a bug fix.

### 69. Seller's payout account resolved as "most recently created verified row," not enforced-unique
**Why:** `payout_accounts.profile_id` has no unique constraint (Prompt 2) —
a seller could in principle have more than one row (e.g. re-resolved a new
bank account after a mistake), but §10 Epic D4 AC3 says "the seller's
verified payout account" (singular). Considered adding a unique constraint
now to remove the ambiguity structurally — rejected as scope creep into
Epic A3's table/action code, unrequested by this prompt's task, and risky
without a data-cleanup step first if any live seller already has 2+ rows.
`release_order()` instead resolves via `ORDER BY created_at DESC, id DESC
LIMIT 1 WHERE is_verified = true` — correct for the realistic case (a
seller updating their bank details), with `id DESC` added as a
deterministic tiebreaker on a same-timestamp collision, at zero cost.
Deferred to `docs/TODOS.md` #1.
**Revisit:** Yes, if `docs/TODOS.md` #1 (the unique constraint) is ever
built — at that point this resolution logic becomes unnecessary defensive
code, not wrong, just redundant.

### 70. "Available balance" (this prompt's own task item) cut entirely, not built in any form
**Why:** the task's literal spec — "sum of `seller_payout_kobo` across
released orders not present in any completed or processing payout" — is
not PRD-sourced (grepped `urs2cash-prd.md`, zero hits on "balance" as a
seller-facing concept) and becomes structurally meaningless the instant
every released order gets an immediate `payouts` row (exactly what
Decisions #67–#69 make true): it would return ~0 for anything released
after this prompt, since there'd almost never be a released order *without*
a payout row to exclude it via. The initial `/plan-eng-review` resolution
was to redefine it as `sum(payouts.amount_kobo) WHERE seller_id = X AND
status = 'queued'`, justified as "the same shape a future admin payout
queue needs." **An independent outside-voice pass (Claude subagent, run as
a standard part of `/plan-eng-review`) checked that specific claim against
the actual PRD and found it wrong**: the real admin payout epic is §10
Epic E3 (the review's citation of "E7" doesn't exist anywhere in the PRD —
Epic E's real items are E1–E5), and E3's actual ACs need a per-payout list
(AC1: seller, masked account, amount, days-since-release) plus a total
**across all sellers** (AC7: "the queue displays total kobo outstanding")
— a structurally different query than a per-seller `sum(queued)`. Nothing
in the codebase called any balance function either way. Presented to the
user as a cross-model tension (the review's own recommendation vs. the
outside voice's correction); resolved in favor of the outside voice —
cut entirely rather than ship a shape nothing needs, justified by a wrong
citation. This is the first time in this project's decision log that an
outside-voice pass reversed the primary review's own recommendation, not
just confirmed it.
**Revisit:** Yes, deliberately — when §10 Epic E3 (admin payout queue) is
actually scheduled, build the real per-payout-list + cross-seller-total
query against that epic's literal ACs, not against this entry's guesswork.

---

## From Prompt 17

Routed through `/plan-eng-review` before any code was written, per your
explicit request, given this is money-adjacent (holding a queued payout)
and touches the atomic order-lifecycle RPCs from Prompts 15/16. An
independent outside-voice pass (Claude subagent — Codex CLI not installed)
caught two real implementation bugs before they shipped and disproved one
of the review's own justifications. Full design doc + review report:
`~/.gstack/projects/slinkiest-web-URS2CASH/bon-main-design-20260730-195138.md`.

### 71. `payouts.status` gains a `held` value, kept as a HARD-RULE safety net despite being provably unreachable under today's state machine
**Why:** §10 Epic D5 AC3 requires holding any already-`queued` payout when
a dispute is raised. Initial reasoning was "defense-in-depth for a race
window" — the outside-voice review checked that against this same design's
own data-flow diagram and disproved it: `release_order()` is the only
payout creator, it only fires on `status = 'delivered'`, and `raise_dispute()`
atomically consumes that same status column with a mutually exclusive
precondition (`status IN ('paid','shipped','delivered')`). A payout
provably cannot exist while an order is still dispute-eligible — not
rarely, but structurally impossible given the current state machine; there
is no race to defend against. Presented to you as a cross-model tension.
**You chose to keep `held` anyway**, reframed honestly: not a defense
against a race that doesn't exist, but a defense against a *future* change
(Prompt 19's `resolveDispute`, or a future refactor that loosens
`release_order()`'s guard) accidentally creating the exact scenario AC3's
HARD RULE forbids ("a disputed order can never produce a paid payout").
Cost is one enum value and one `UPDATE` statement affecting zero rows
today; the cost of being wrong about "provably impossible forever" is a
real money-safety bug. `held` added to `payouts_status_enum`
(`queued`/`held`/`paid`/`failed`), orthogonal to Prompt 16's `is_blocked`
(a different axis — no verified account, vs. frozen due to dispute).
**Revisit:** Only if Prompt 19's `resolveDispute` or a future refactor
genuinely makes this branch reachable — at that point this becomes an
active safety net rather than documented dead code, and the reasoning
should be re-read against whatever changed.

### 72. Dispute window computed from a status guard + `delivered_at + N days`, never by referencing `orders.auto_release_at`
**Why:** §10 Epic D5 AC1's literal text ("7 days of `delivered_at` or
`auto_release_at`, whichever is first") doesn't map onto this schema's
actual columns — `orders.auto_release_at` (set by `markShipped`, Prompt 15)
stores the `shipped_at + 7 days` SHIPPED→DELIVERED deadline, not a
DELIVERED→RELEASED one; the 72-hour delivered-to-released window is a
config constant (`DELIVERED_AUTO_RELEASE_HOURS`), never stored per-order.
Literally computing `least(delivered_at + 7 days, auto_release_at)` would
compare against the wrong deadline entirely. Flagged before writing code;
resolved via `WHERE status IN ('paid','shipped','delivered')` alone
implementing "whichever is first" as an emergent property (an order that
already auto-released is no longer in this set, so the check fails on its
own with zero explicit reference to `auto_release_at` needed), combined
with, only when `delivered_at` is set, `now() <= delivered_at +
make_interval(days => p_window_days)`. A still-`paid`/`shipped` order (no
`delivered_at` yet) has no time cutoff from this AC at all. `p_window_days`
is a parameter sourced from the new `DISPUTE_WINDOW_DAYS = 7` constant
(`timing-config.ts`), never hardcoded in SQL — the first draft of
`raise_dispute()` had hardcoded `interval '7 days'` directly, a direct
violation of this migration file's own established convention (quoted
verbatim from `20260729110000_order_transitions.sql`'s header comment),
caught by the outside-voice review before it shipped.
**Revisit:** No — this is now the correct, permanent shape.

### 73. `disputes_insert_participant` (Prompt 5) narrowed to buyer-only
**Why:** the original policy allowed either the buyer or the seller to
insert a dispute (`o.buyer_id = auth.uid() OR o.seller_id = auth.uid()`),
but §10 Epic D5 AC1 says only the buyer may raise one. `raiseDispute`'s own
app-level check enforces buyer-only, but RLS is what actually gates a
*direct* client-side insert via the Supabase JS SDK — before this prompt, a
seller could bypass the server action entirely and insert their own
dispute, unnoticed by any app-level check. Flagged before writing code;
you chose to tighten it. New policy `disputes_insert_buyer_only` requires
`raised_by = auth.uid() AND o.buyer_id = auth.uid()`. Verified live: a
seller attempting a direct insert (via `SET ROLE authenticated` +
`request.jwt.claim.sub`) is rejected with "new row violates row-level
security policy for table disputes."
**Revisit:** No.

### 74. Shared `authorizeOrderAction()` helper extracted, refactoring 3 existing actions
**Why:** `raiseDispute` would have been the 4th order-lifecycle action with
the identical inline shape (fetch order → check actor → check status →
call RPC) — none of `markShipped`/`confirmDelivery`/`releaseOrder`
extracted this. Per your stated DRY preference and the "three similar
lines" threshold, extracted `src/lib/orders/authorize-order-action.ts` now
rather than deferring again. The first draft's signature had no
column-selection mechanism, which would have silently dropped
`markShipped`/`confirmDelivery`'s `paid_at`/`shipped_at` reads (needed for
their `hours_since_paid`/`hours_since_shipped` analytics properties) during
what was supposed to be a zero-behavior-change refactor — caught by the
outside-voice review before it shipped. Fixed: the helper takes an explicit
`selectColumns` string and a `Row` generic, so each caller gets exactly the
columns it needs, typed. All 4 actions (including the 3 refactored ones)
call it; `npx vitest run` (147/147, unchanged) and live re-verification of
`markShipped`/`confirmDelivery`/`releaseOrder` confirm zero behavior
change.
**Revisit:** No.

---

## From Prompt 18

### 75. `ratings` insert never uses `.select().single()` after the write — the id is client-generated instead
**Why:** a real bug found by live verification, not by inspection. `ratings`
deliberately has **no SELECT policy at all** for `authenticated`, not even
self-read of one's own row (Decision #24 — "no update, no delete, for any
role... not even the rater"; public reads go through `ratings_public`
only). Supabase's `.insert(row).select("id").single()` pattern issues a
single `INSERT ... RETURNING id`, and returning the new row requires a
*passing SELECT policy* on it, in addition to the INSERT policy's `WITH
CHECK` — with zero SELECT policy on the base table, that read-back fails
RLS even for a fully valid insert by the correct buyer. Confirmed live,
precisely: the identical `INSERT` statement succeeds when run without a
trailing `RETURNING`/`.select()`, and fails with "new row violates
row-level security policy for table ratings" the instant one is added —
same role, same session, same row. `createListing`'s own
`.insert().select("id").single()` (Prompt 7) works fine by contrast,
because `listings` *does* have an owner-read SELECT policy
(`listings_select_own`) — `ratings` is the first table in this schema
inserted via the user's own session client that has zero self-read at all,
which is exactly why this bug had never been hit before. Fixed:
`submitRating` generates the rating's `id` with `crypto.randomUUID()`
before inserting (same pattern already used for client-generated ids
elsewhere in this codebase — `listing-form.tsx`, `upload-listing-photo.ts`)
and inserts without any `.select()` at all, so no RLS-gated read-back is
ever required.
**Revisit:** No — this is the correct, permanent shape. Any future action
that inserts into `ratings` (or any other table with zero SELECT policy
for the writing role) must follow the same pattern, not
`.insert().select()`.

### 76. `submitRating`'s insert goes through the buyer's own session client, not the service-role client — the opposite posture from every order-lifecycle action
**Why:** PRD §7.2 frames `ratings_insert_buyer_on_concluded_order` (Prompt
5's RLS policy) as "the actual enforcement layer, not a convenience" —
unlike `orders`, which has zero authenticated write policies (forcing
every order-lifecycle action through the service-role client, Decision
from Prompt 13's checkout), `ratings` is designed so RLS itself is the
real gate for AC1 (buyer-only, concluded-order-only) and, combined with
the `order_id` UNIQUE constraint, AC3/AC12 (one rating per order, race
caught at the constraint, never a pre-check). `submitRating`'s app-level
checks (buyer match, status check) exist for a clearer error message only,
mirroring the same "defense in depth, not the real gate" posture this
codebase already uses elsewhere (e.g. Decision #56). The service-role
client is used only for the secondary, unrelated lookup needed to resolve
`moderation_flags.listing_id`/`categorySlug` when a review is flagged
(§9.3) — `moderation_flags` itself has zero RLS policies for
`authenticated` ("Admin only"), so that specific write always needs
service role regardless.
**Revisit:** No.

### 77. A rating's contact-detail flag resolves `moderation_flags.listing_id` via the order being rated, not a new column on `ratings`
**Why:** `moderation_flags.listing_id` is `NOT NULL` (Prompt 5), but
`ratings` has no `listing_id` of its own (only `order_id`/`rater_id`/
`seller_id`) — a rating's review text has no listing to attach a flag to
except by way of the order it concerns. `submitRating` derives it via
`orders.listing_id` (already fetched for the buyer/status check) →
`listings.category_id` → `categories.slug` (two sequential queries via the
service-role client, matching this codebase's general preference for
explicit queries over a single deep nested-select — no precedent for that
pattern exists elsewhere in this codebase to build on). `categorySlug` is
only used for the `contact_detail_flagged` event's `category_id` property
(itself always the registry slug, not the DB UUID, consistent with every
other call site of this event). Verified live end-to-end against the real
production code (not a re-implementation): a review containing a phone
number correctly resolved the listing's category slug and produced a
`moderation_flags` row with the right `listing_id`/`pattern_type`/
`matched_text`.
**Revisit:** No.

### 78. The 72-hour rating reminder is a real cron route + a new `orders.rating_reminder_sent_at` column, not deferred alongside the email itself
**Why:** §10 Epic D6 AC10 ("one reminder at 72 hours if unrated, no
further reminders") isn't in this prompt's own VERIFICATION list, and the
actual email send is Prompt 22's scope, same as every other order_*
notification so far — but enforcing "exactly one reminder, ever" needs
some persisted marker to check against, and none existed. Flagged before
building (a real scope fork, not a trivial one): build the full mechanism
now, or only fire `rating_prompt_shown` on page view and skip the reminder
entirely this prompt. You chose to build it now. New migration
(`20260801090000_ratings_action.sql`) adds `orders.rating_reminder_sent_at
timestamptz`; new cron route `/api/cron/rating-reminders` (same shape as
`expire-pending-orders`/`auto-release-orders`) finds `released`/`refunded`
orders ≥`RATING_REMINDER_HOURS` (72, `timing-config.ts`) old with no
rating and no reminder sent yet, fires `rating_prompt_shown` (the same
event as the on-page prompt — PRD §3.5 names no separate "reminder" event)
and stamps the column so it can never fire twice. Verified live via a real
HTTP request against the dev server (not just direct SQL): an eligible
unrated order gets exactly one reminder and the column stamped; a second
run finds nothing left to do; a separately-seeded eligible-but-already-
rated order is correctly excluded and never stamped.
**Revisit:** No.

---

## From Prompt 19

### 79. Admin role: a single `profiles.is_admin boolean`, checked fresh from the database by `requireAdmin()` on every admin server action
**Why:** §10 Epic E5 AC2's HARD RULE is explicit: "a database column, never
an env var list of emails." `profiles` already carries `is_suspended` in
exactly this shape (Prompt 2), so `is_admin` is the same pattern, same
table, not a new `admin_users` table — there is nothing about "is this
profile an admin" that needs its own row, join, or audit trail beyond what
a boolean already gives (unlike suspension, no reason/actor needs
recording for granting admin — see Decision #80 on why that's true).
`src/lib/admin/require-admin.ts`'s `requireAdmin()` is the one reusable
check every admin server action calls first, unconditionally, via the
service-role client — never trusting the session, a cached claim, or
whatever the middleware already decided (§11.2 HARD RULE: "middleware
protection is not sufficient"). Live-verified: a non-admin session's own
`profiles.is_admin` correctly resolves `false`; the same query for a
just-granted admin correctly resolves `true` on the very next call, no
token refresh needed (the whole point of re-querying instead of trusting
a JWT claim).
**Revisit:** No, unless a future prompt needs graduated admin roles
(e.g. "moderator" vs "full admin") — that would be a deliberate schema
change (an enum/text column instead of a boolean), not a fix to this one.

### 80. First-admin bootstrap is `scripts/promote-admin.ts`, run manually with the service-role key — never a migration, never a server action, never a public route
**Why:** two options were considered and rejected. A seeded migration
(`UPDATE profiles SET is_admin = true WHERE ...`) would either hardcode a
real email into a file committed to git (a credential-adjacent leak, and
the literal thing §10 Epic E5 AC2 forbids in spirit even if not in the
literal column sense) or fail silently in every environment where that
user hasn't signed up yet (a fresh `db reset` runs seed.sql before any
`auth.users` row could exist). A server action was rejected outright: any
action that grants admin needs its own caller to already be verified as
admin, which is exactly the bootstrap problem — the very first admin has,
by definition, no existing admin to grant them access. The script sidesteps
both: it requires the service-role key (already the highest-trust secret
in this codebase, per `server.ts`'s own `server-only` guard), looks up the
target by email via `auth.admin.listUsers()` (paginated — supabase-js has
no `getUserByEmail`), shows exactly who's about to be promoted, and
requires typing `yes` before writing anything. Confirmed the "is_admin
already true" case short-circuits with no prompt (idempotent, safe to
re-run). README documents running it against a real deployment via
`vercel env pull` first — never wiring the service-role key into a request
handler to make this "self-service."
**Revisit:** No.

### 81. Real gap found and closed: `profiles_update_own`/`listings_update_own` had no column-level protection — a BEFORE UPDATE trigger, not a narrower RLS policy, closes it
**Why:** RLS is row-level, not column-level (the same limitation Decision
#1/#24 already worked around for SELECT, via dedicated `_public` views).
There is no equivalent view-based escape hatch for UPDATE — the established
pattern in this schema for column-level UPDATE protection is a trigger
comparing OLD/NEW (`prevent_published_listing_core_field_changes`, Prompt
4). Before this migration, nothing stopped an authenticated user from
directly `PATCH`-ing their own `is_suspended`, `listing_limit_override`,
`rating_average`, `completed_sales_count`, or (as of this migration)
`is_admin` via the client SDK, entirely bypassing every server action.
This wasn't previously flagged because no admin-settable column existed to
make the gap concrete — closing it in the same migration that introduces
the first one, rather than shipping `is_admin` onto a table that already
can't protect it. Same shape applied to `listings.status <-> 'suspended'`
plus the three suspension audit columns, so a suspended listing's owner
cannot self-unsuspend by directly updating `status` back to `published`.
Both triggers distinguish "the row owner's own authenticated session" from
"the service role" via `auth.uid() is not null` — a real user JWT sets it,
the service-role key (every admin action, always) doesn't, matching the
same reasoning Decision #28 already established for
`recompute_seller_rating`'s `SECURITY DEFINER` boundary. Live-verified,
not just reasoned about: an authenticated attacker session's direct
`.update({is_admin: true})`/`.update({is_suspended: true})`/
`.update({listing_limit_override: 99999})` on her own profile row all
silently no-op (still `false`/`false`/`null` after), her direct
`.update({status: 'published'})` on her own already-suspended listing
silently no-ops (still `suspended` after), while an ordinary self-edit
(`bio`, or an unsuspended listing's `description`) still succeeds —
confirming the trigger is scoped to exactly the protected columns, not a
blanket "owner can never update this row again."
**Revisit:** Yes, if a future prompt adds another admin-only or
trigger-maintained column to `profiles` or `listings` — extend the
existing trigger function's condition list, don't write a third one.

### 82. `suspendSeller` does not cascade to the seller's own listings
**Why:** §11.2's action list has `suspendListing` and `suspendSeller` as
two independent actions, and no AC anywhere ties them together — the
closest text (§5.4: "a suspended seller's listings return 404 publicly and
remain visible to her with the reason") is, read in context, describing
per-*listing* suspension, not a cascading account-level effect (see
`docs/KNOWN_ISSUES.md` #36's fuller reasoning). Same "don't add an
unrequested restriction" posture as Decision #38 (`removeListing`'s lack of
a status guard). The seller's public profile still disappears for free —
`profiles_public` (Decision #1) already filters `where is_suspended =
false` — but her existing `published` listings stay purchasable until an
admin separately suspends each one, or a future prompt deliberately builds
cascading suspension.
**Revisit:** Flag for explicit product sign-off before this matters in
practice — "suspend this seller" reading as "and nothing she's already
listed changes" is a genuine surprise risk for whoever operates this
queue, even though it's the literal, unrequested-restriction-free reading
of the spec.

### 83. No `dispute_resolved` event — `resolveDispute` fires `order_released`/`order_refunded`, the two PRD-sanctioned events that already exist for these exact transitions
**Why:** this prompt's own task brief said "Emits `dispute_resolved`."
Grepped §3.5's full event table — zero hits for that name, anywhere. Same
shape as Decision #26 (`seller_listing_ordinal` rejected, no dual-naming
scheme exists) — §3.5's own HARD RULE is "every event below is emitted...
there is no separate analytics implementation task," which reads as an
exhaustive list, not a floor. `order_released` ("Order reaches released")
and `order_refunded` ("Refund completed") already exist and already
describe exactly what happens on each path of a dispute resolution,
regardless of which actor (buyer, cron, or now admin) got the order there
— firing them here, via the same `trackOrderReleased` helper the buyer/cron
release path already uses (for `order_released`) and a direct `track()`
call carrying `refund_reason: notes` (for `order_refunded`), is more
consistent with the rest of this codebase's event model than inventing a
new admin-specific event would have been.
**Revisit:** No, unless the PRD is amended to add `dispute_resolved`
explicitly with its own property list — at which point build exactly that,
not a guess at its shape.

### 84. No distinct "Gadgets auto-flag" mechanism exists or was built — the task brief's citation doesn't match anything in §6.4.3
**Why:** the task asked the moderation queue to prioritise "the Gadgets
auto-flag cases from 6.4." Re-read §6.4.3 in full looking for anything
resembling a flag-not-block mechanism specific to Gadgets: every one of its
HARD RULEs (`functional_status` must be `fully_functional`,
`icloud_or_frp_locked` must be `false`, `screen_condition: cracked` "blocks
publish") is a hard *submission-time* rejection enforced by the category's
Zod schema (Prompt 3) — the listing never gets created, so it can never
reach a post-publish moderation queue at all. That's a structurally
different mechanism from §9.3's contact detector (flags, never blocks,
after a successful publish), and nothing in §6.4.3 describes a third,
distinct auto-flag behavior for Gadgets specifically. Same citation-drift
pattern this project has hit before (Decisions #21, #26, #35, #54) —
resolved by building nothing extra: a Gadgets listing that trips the
generic contact detector gets exactly the same treatment as any other
category's, via the identical `moderation_flags` newest-first queue
(Decision #40's mechanism, unchanged).
**Revisit:** Only if a future PRD revision actually defines a Gadgets-
specific auto-flag rule with its own trigger condition — re-read this
decision against that text at that point.

### 85. `resolve_dispute_release`/`resolve_dispute_refund` are two separate SQL functions, not a parameterised reuse of `release_order`
**Why:** `release_order()` (Prompt 16)'s own `WHERE` clause requires
`status = 'delivered'` — a disputed order is never `delivered` again, it
goes `disputed -> released` directly per §8.1's state diagram, so
`release_order()` cannot be called unchanged for this path. Duplicating its
payout-creation block (verified-account lookup, `is_blocked` computation)
into a new function with its own `WHERE status = 'disputed'` guard keeps
each function's precondition obviously correct at a glance, matching how
`expire_pending_order`/`auto_advance_shipped_to_delivered` already stay
separate from `release_order` rather than being merged into one
heavily-parameterised transition function. The refund path
(`resolve_dispute_refund`) creates no payout row via the absence of any
insert into `payouts` — provably correct with zero guard code, since a
disputed order can never have held a payout row to begin with (raise_dispute
only ever fires on `paid`/`shipped`/`delivered`, all strictly before
`release_order`'s own `delivered`-only payout-creation moment).
**Revisit:** No.

### 86. `resolveDispute`'s buyer path calls the Paystack refund API before flipping any database state, the mirror image of `initiateCheckout`'s own sequencing
**Why:** getting this order backwards would let an admin's click alone mark
an order `refunded` in the database while no money had actually moved —
the exact class of bug this project already avoided once (Decision #55:
`initiateCheckout` deletes its provisional `pending` row if Paystack's
`initialize` call fails, rather than leaving a `pending` order for a
payment that was never actually attempted). `refundTransaction()`
(`src/lib/paystack/index.ts`) is called first; only on success does
`resolve_dispute_refund()` run. If the RPC itself then fails after a
successful refund call (a genuine edge case — the refund already happened,
the DB didn't catch up), the error is logged for manual reconciliation
rather than silently swallowed or retried automatically, since silently
retrying a refund call risks a duplicate refund. "Accepted" here means
Paystack's synchronous acknowledgement of the refund *request*, not
settlement confirmation — same asymmetry `initializeTransaction` already
has (Decision from Prompt 13/14; a real refund webhook would close this
fully and is out of this prompt's scope, same limitation as the rest of
`webhook_events`' single-event-type reach today).
**Revisit:** Yes, when a Paystack refund webhook is eventually built —
revisit whether this synchronous "request accepted" gate should defer to
webhook confirmation instead, the same closure `mark_order_paid`'s webhook
already gives the payment side.

### 87. `hideReview`'s `reason` argument is validated and logged, never persisted on `ratings`
**Why:** §11.2's HARD RULE is unusually specific: "`hideReview` sets
`is_hidden` only. It has no path to `score`, `rating_average`, or
`rating_count`." Read literally — "is_hidden only" — rather than as
shorthand for "don't touch the trust-metric columns specifically." Adding
a `hidden_reason`/`hidden_by`/`hidden_at` column set (the shape this
project used for `listings.suspension_reason`, Decision from this same
prompt) would technically still satisfy the narrower reading but not the
literal one, and nothing in Epic E1-E4's ACs asks a hidden review's reason
be shown anywhere — unlike `listings.suspension_reason`, which §5.4's own
HARD RULE requires be retrievable ("remain visible to her with the
reason"). The `UPDATE` in `src/lib/actions/admin.ts`'s `hideReview` touches
exactly one column; the reason is `console.log`'d for operator visibility
only, matching §11.3's "internal detail is logged, never returned"
convention already established for error handling.
**Revisit:** If a future prompt's brief explicitly asks for a
seller-visible or admin-queue-visible hide reason, that's a deliberate
scope addition needing its own column (following `listings.suspension_reason`'s
shape) — not a sign this reading was wrong.

### 88. `/admin` route-cloaking in middleware: rewrite to a guaranteed-unmatched path, not a bare `new NextResponse(null, {status: 404})`
**Why:** §10 Epic E5 AC1 requires a non-admin's response be genuinely
indistinguishable from hitting a random broken link — a bare synthetic 404
response, with no body, would be trivially distinguishable from the app's
real not-found page (no styling, no matching headers, nothing) if anyone
ever compared the two. `NextResponse.rewrite(new URL("/__admin_route_not_found__", request.url))`
makes Next's own app router resolve that (guaranteed-unmatched) path
exactly the way it resolves any other nonexistent URL on the site —
through the same not-found boundary, same status code, same rendered
output — with zero new files needed (no dedicated "admin 404" page to
maintain and keep in sync with the real one). Session cookies from the
`getUser()` call earlier in the middleware are still forwarded onto the
rewritten response, so a signed-in non-admin's token refresh isn't lost
just because she hit a route she can't access. Live-verified: an
unauthenticated request to `/admin` and `/admin/moderation` both return
`404`, while every other protected prefix (`/dashboard/listings`) still
`307`s to `/sign-in` — the deliberately different failure mode the AC
calls for.
**Revisit:** No.

---

## From Prompt 20

### 89. Payout completion has no order-side effect at all — no `paid_out` status, `payouts.status` becomes `paid` (not `completed`)
**Why:** this prompt's own task brief said `markPayoutPaid` "sets completed"
and "transitions the constituent orders to `paid_out`." Grepped §7.1's
`payouts` table (`status text NOT NULL DEFAULT 'queued'` — the original
migration's own CHECK constraint lists exactly `queued`/`paid`/`failed`,
`held` added in Prompt 19) and §8.1's order state machine (a closed,
exhaustively-diagrammed 9-value set: `pending`/`paid`/`shipped`/
`delivered`/`released`/`disputed`/`refunded`/`cancelled`/`expired`) — zero
hits for `completed` or `paid_out` anywhere in either. §10 Epic E3 AC3 is
also explicit and literal: "Sets `paid`, `paid_at`, `paid_by`." Resolved in
favor of the PRD text, same posture as Decisions #21/#26/#35/#54/#83/#84:
`mark_payout_paid()` only ever writes to the `payouts` row; nothing in this
prompt touches `orders.status`. An order that reaches `released` stays
`released` forever after — §8.1's own table already says as much
("`released`: Funds owed to seller, payout row created | System" — the
terminal successful state for the order itself; the payout's *own*
lifecycle, tracked entirely on a separate table, is what completes
afterward). Live-verified: a payout's constituent order's `status` is
observed unchanged (`released`) immediately after `mark_payout_paid`
succeeds.
**Revisit:** No, unless a future PRD revision explicitly adds a `paid_out`
(or similarly named) order status with its own ACs — at which point this
decision should be re-read against that new text, not silently reverted to
match a task brief's paraphrase.

### 90. `payout_marked_paid` fires, not `payout_completed`
**Why:** same citation-drift shape as Decision #83 — grepped §3.5's full
event table, zero hits for `payout_completed`; `payout_marked_paid` already
exists there ("Admin marks payout paid" · `payout_id`, `hours_since_released`)
and was already scaffolded in `src/lib/analytics/events.ts` since Prompt 19
in anticipation of exactly this prompt. `hours_since_released` is computed
from the constituent *order's* `released_at`, not the payout row's own
`created_at` — normally the same instant (payout rows are created
atomically with the `released` transition) but not guaranteed to be, and
the PRD's own property name says "released," not "payout created."
**Revisit:** No.

### 91. The double-payout guard is a partial unique index excluding `failed` rows, not a blanket `UNIQUE` — the HARD RULE's own "non-failed" wording is the textual signal
**Why:** this prompt's HARD RULE #4 reads "a single order can NEVER appear
in two **non-failed** payouts" (emphasis in the original task text) — an
explicit carve-out that would be entirely redundant under a blanket
`UNIQUE` on `order_id` (which already guarantees "never in two payouts,
full stop," failed or not, with no need to say "non-failed" at all). The
only way that phrasing makes sense is if a failed attempt is expected to
remain its own permanent row rather than being reused or deleted, and a
retry inserts a genuinely new row for the same order. This is the exact
same shape Decision #54 already established for `orders.listing_id`
(`orders_listing_id_active_unique`, scoped to exclude `cancelled`/
`expired`) — `payouts_order_id_active_unique` here excludes `failed` the
same way. Live-verified: a second `queued` insert for an order that
already has one is rejected (Postgres `23505`); after `mark_payout_failed`
moves the original row to `failed`, a fresh `queued` row for the *same*
order inserts successfully; a third non-failed row for that same order is
then rejected again — exactly "at most one non-failed row per order, at
any time," which is what the HARD RULE actually asks for.
**Revisit:** No — this is the resolved reading, not a judgment call left
open.

### 92. `mark_payout_failed()` creates a fresh retry row rather than flipping the failing row back to `queued` in place
**Why:** follows directly from Decision #91 — if failed rows are meant to
persist as permanent historical records (the reason the unique index
excludes them), then "returns the payout to `queued` on retry" (§10 Epic E3
AC4) must mean a *new* row, not mutating the old one's status back and
forth. The failing row keeps `status='failed'` and its `failure_note`
forever, an honest audit trail of what went wrong and when; the retry row
re-resolves `payout_account_id`/`is_blocked` from scratch (the exact same
"most recently created verified `payout_accounts` row" lookup
`release_order()`/`resolve_dispute_release()` already use), rather than
copying the failed row's stale values forward — the whole point of a retry
is that the seller may have fixed the account problem that caused the
failure in the first place. This is not "admin creating a payout," which
§11.2 HARD RULE #5 forbids (`docs/HANDOFF.md`'s own framing: "Admin does
NOT create payouts... admin only marks them paid or failed") — the admin
never chooses which order gets a fresh attempt or invents one from
nothing; the row is a mechanical, structural consequence of marking one
failed, for an order that already, permanently, has exactly one payout
lineage (`release_order`/`resolve_dispute_release` remain the only places
a payout is ever created for a brand-new order). Live-verified: after
`mark_payout_failed`, exactly 2 rows exist for that order (the failed
original + a fresh `queued` retry carrying the correct amount and a
freshly re-resolved account).
**Revisit:** No.

### 93. The payout queue is scoped to `status = 'queued'` only — `held` and the brief's "processing" are both out of scope
**Why:** §10 Epic E3 AC1 says literally "Lists `queued` payouts." The
task brief's own "(and processing)" doesn't correspond to any real status —
`payouts.status`'s only values are `queued`/`held`/`paid`/`failed`, and
`held` is a distinct, dispute-frozen concept (§10 Epic D5 AC3, Prompt 19)
that this AC never mentions. Scoping the query to `queued` only (not
`status != 'paid' AND status != 'failed'`, which would silently also
surface `held` rows an admin cannot act on and this AC never asked to
show) keeps the queue's contents exactly matching its own literal spec.
**Revisit:** If a future prompt's brief explicitly wants disputed/frozen
payouts visible somewhere in `/admin` (a reasonable ask, just not this
one), that's a deliberate scope addition with its own AC to build against,
not a fix to this decision.

### 94. Masked account details are shown once per seller group, not once per constituent payout row
**Why:** §10 Epic E3 AC1 asks for "seller, masked account details, amount,
and days since release" in a list of payouts; this prompt's own brief adds
grouping by seller on top. A seller's queued payouts all resolve to the
same verified `payout_accounts` row in the overwhelmingly common case (one
verified account per seller in practice, even though no DB uniqueness
enforces that — `docs/TODOS.md` #1), so repeating the identical masked
account string on every line item under an already-labelled seller group
would be pure noise. `getPayoutQueue()` keeps the first non-null masked
account it finds per seller group; each row still carries its own
`amountKobo`/`daysSinceReleased`/`isBlocked`/`orderId` independently, so
nothing AC1 asks for per-payout is actually lost.
**Revisit:** No, unless a future prompt surfaces a case where a single
seller's queued payouts legitimately resolve to *different* accounts (e.g.
she changed banks mid-queue) — worth showing per-row at that point, not
before.

---

## From Prompt 21

### 95. Section-number citation drift resolved: the real success framework is §3, not "section 2"; independent flags are §6.2, not "section 4"; no "US-13"/"US-14" exist anywhere in the PRD
**Why:** this prompt's task brief cited "section 2 (the success framework
and all its metrics)," "2.5 (events)," "2.6 (the browsable threshold)," and
labelled the two ACs "US-13"/"US-14." Re-read the PRD's own headers before
writing any code: §2 is "The core question this MVP exists to answer" (no
metrics in it — it's the 2.2-transactions-per-seller framing that motivates
§3); §3 is "MVP success framework" (§3.1 primary metric, §3.2 supporting
metrics, §3.4 kill/expand — the real browsable-gate numbers, "30 or more
active published listings from 10 or more distinct sellers... conversion...
at or above 15%," live here); §3.5 is the event schema. §4 is "Users and
roles" — it only says admin "controls category flags," nothing about the
flags' own independence, which is §6.2's HARD RULE. Grepped the whole PRD
for "US-13" and "US-14" — zero hits; the real ACs are §10 Epic E4. Same
shape as every prior citation-drift decision (#21, #26, #35, #54, #83, #84,
#89, #90) — built against the real section numbers throughout this
prompt's migration and code, not the brief's shifted ones.
**Revisit:** No.

### 96. Buyer repeat rate is computed on a 30-day window, not the task brief's 60
**Why:** §3.2's own literal text: "Buyer repeat rate (30 day)." The task
brief asked for "buyer repeat rate within 60 days" — a direct numeric
contradiction, not just a citation-number slip. This prompt's own HARD
RULE ("Metrics are the ones enumerated in PRD section [3]; do not invent
or omit") cuts decisively in favor of the PRD's stated window over the
brief's paraphrase — `metric_buyer_repeat_rate_30d()` matches the name and
the number both.
**Revisit:** No, unless the PRD itself is amended to widen this window —
that would be a deliberate spec change, not a correction of this reading.

### 97. Every metric is computed directly from `listings`/`orders`/`disputes`/`moderation_flags`/`payouts` — none from an event stream, because none exists yet to query
**Why:** `track()` (`src/lib/analytics/events.ts`) has been a
`console.log` stub since Prompt 7 and remains one as of this prompt — this
prompt's own context handoff says the *next* prompt is where "the
analytics event layer used as stubs throughout" gets consolidated. §3.5's
own "derived, not emitted" note already establishes the precedent for the
three metrics it names explicitly (second listing rate, cohort retention,
time to second listing) — computed from `listing_published`'s underlying
facts (`seller_listing_index`, timestamps), not a dedicated event. This
prompt extends that identical posture to every other §3.2 metric out of
necessity: there is no PostHog data anywhere in this stack to query, so
"compute from persisted state" is the only route that exists, not a
choice made over some available alternative.
**Revisit:** Yes, once Prompt 22 wires a real, queryable event sink — at
that point, decide per metric whether the DB computation stays authoritative
(it's arguably more accurate for anything with a database-native
definition, e.g. second listing rate) or whether some metrics should shift
to event-sourced computation. Not a decision to pre-empt now.

### 98. Listing abandonment rate is a DB-derived proxy (the fraction of all `listings` rows stuck at `status = 'draft'`), not the literal `listing_draft_started`-vs-`listing_published` ratio §3.4.1's diagnostic text refers to
**Why:** neither side of that literal ratio is queryable — `listing_draft_started`
fires on "listing form first opened," which can happen with zero DB
footprint at all if the visitor leaves before the first autosave (Decision
#97's stub-event problem, sharpened here: even once Prompt 22 wires real
events, a fully-abandoned-before-save visit still leaves no `listings` row
to join against). The proxy this prompt ships (stuck-draft rows / all rows
ever created) understates true abandonment for exactly that reason —
documented as a proxy in the migration's own SQL comment, in
`get-metrics.ts`, and in the dashboard's own UI copy, not presented as the
literal figure.
**Revisit:** Once a real, persisted `listing_draft_started` event exists
(Prompt 22+), revisit whether the true event-based ratio should replace
this proxy, or run alongside it as a second, more complete figure.

### 99. Payout latency (§3.2's 8th supporting metric) is shown on the dashboard even though this prompt's own task brief dropped it from its bullet list
**Why:** the brief's 9-item metrics list swaps "payout latency (median,
hours)" — a real, named §3.2 metric ("Time from order reaching `released`
to payout marked paid by admin... above 48 hours consistently means
automate") — for "listing abandonment rate," which isn't one of §3.2's 8
formally-named metrics (it's referenced only in §3.4.1's diagnostic
prose). Given this prompt's own HARD RULE ("do not invent or omit"),
dropping payout latency to match the brief's list would be exactly the
omission that rule forbids. Built both: payout latency
(`metric_payout_latency_hours()`) alongside abandonment rate, not a swap.
**Revisit:** No.

### 100. Every "within N days" metric restricts its denominator to subjects whose full N-day window has already elapsed — an unbiased-cohort treatment applied uniformly across §3.1/§3.2
**Why:** without this, a seller/buyer/listing that simply hasn't had time
yet to reach a within-window outcome would be counted as a same-weight
"failure" alongside genuine misses, artificially depressing every rate the
moment fresh activity happens (worse the more actively the platform is
growing — exactly backwards). Applied consistently: `metric_second_listing_rate()`
only counts sellers whose first listing is ≥30 days old;
`metric_listing_to_sale_conversion_by_category()` only counts listings
published ≥30 days ago; `metric_buyer_repeat_rate_30d()` only counts
buyers whose first release is ≥30 days old. §3.1's own definition already
implies this ("of all sellers who publish a first listing in a given
week... within 30 days" — a completed-week cohort, not a still-running
one); this prompt applies the identical logic to §3.2's siblings, since
nothing in their text suggests a different treatment was intended.
Live-verified: a seller whose first listing is only 5 days old is
correctly excluded from the second-listing-rate cohort entirely (neither
counted as a pass nor a miss).
**Revisit:** No.

### 101. Leakage signal rate is scoped to `moderation_flags.source = 'auto_contact_detect'` only — "admin flagged leakage cases" (the other half of §3.2's own definition) can't be isolated with the current schema
**Why:** §3.2 defines the count as "listings flagged by the contact detail
detector at submission, **plus** admin flagged leakage cases." The schema
has no way to distinguish an admin-sourced flag that was specifically
about leakage from any other admin-sourced flag (skin-lightening,
counterfeit, repeat-violation — the full `SUSPEND_LISTING_REASONS` list
from Prompt 19) — `moderation_flags.source = 'admin'` is one undifferentiated
bucket. Rather than over-count by treating every admin flag as a leakage
signal (which would silently inflate the figure with unrelated moderation
actions), this metric counts only the half of §3.2's definition the schema
can actually isolate precisely, and the gap is documented (Known Issues),
not silently absorbed into a wrong number.
**Revisit:** If a future prompt adds a `moderation_flags.category` or
similar taxonomy distinguishing flag *types* within the `admin` source
(a real, useful addition for the moderation queue too, not just this
metric), extend this function to include those rows.

### 102. `setCategoryFlags` fires `category_enabled` only on the specific `browsable` false→true transition — the category's *current* value is read before the update, never inferred from the caller's input alone
**Why:** §10 Epic E4 AC4: "`category_enabled` fires on a `browsable` flip
to **true**" — not on every `browsable` write. A caller could in principle
pass `browsable: true` on a category that's already browsable (e.g. a
retried request, or a UI double-click race) — re-firing the event in that
case would double-count a category enable that never actually happened
this time. `setCategoryFlags` selects the row's current `browsable` value
first, computes `isBrowsableFlip = data.browsable === true &&
category.browsable === false`, and only fires the event when that's true —
never on a `listable`-only change, never when already `true`, never on a
flip to `false`. `listing_count_at_flip` is queried fresh at the moment of
the decision (the live published count the admin was looking at when she
clicked), not a stale value carried from the page load.
**Revisit:** No.

---

## From Prompt 22

### 103. Section-number citation drift resolved again: the real event schema is §3.5, the real stack section is §12.1, not "2.5"/"3.1"
**Why:** same recurring pattern as Decisions #21/#26/#35/#54/#83/#84/#89/#90/#95
— this prompt's own brief cited "section 2.5 (the complete event schema)"
and "3.1 (Resend + React Email, PostHog)." Grepped the PRD's own headers:
§2 is "The core question this MVP exists to answer" (no events in it); §3
is "MVP success framework," and §3.5 specifically is the event schema
(confirmed identical to the table this codebase's `events.ts` already
implemented in full since Prompt 7); §3.1 is "Primary metric" (the
second-listing-rate definition, nothing about Resend/PostHog at all) — the
real stack table, naming "Email: Resend, React Email" and "Analytics:
PostHog" explicitly, is §12.1. Built against the real section numbers
throughout this prompt's migration-free, code-only work.
**Revisit:** No.

### 104. `is_first_listing` stays on `listing_draft_started`, never added to `listing_published` — the task brief conflated two different events' properties
**Why:** the brief asked for "the seller listing ordinal / is_first_listing
on listing published," reading as if both belong to one event.
§3.5's actual table splits them: `listing_draft_started`'s properties are
`category_id, is_first_listing`; `listing_published`'s are `listing_id,
category_id, price_kobo, condition, photo_count, seller_listing_index,
time_to_publish_seconds` — no `is_first_listing` anywhere on the second
one. Both were already correctly placed on their respective events since
Prompt 7/8 (verified by re-reading `listing-form.tsx`'s existing
`listing_draft_started` call and `listings.ts`'s existing
`listing_published` call before touching either) — "the seller listing
ordinal" is `seller_listing_index`, already present and correct on
`listing_published`. No code change was needed here at all; this decision
exists so a future reader doesn't "fix" a gap that was never real.
**Revisit:** No.

### 105. No "buyer order ordinal" property on `order_paid` — extends Decision #59's already-settled reasoning to this prompt's identical re-ask
**Why:** the task brief again asked for a "buyer order ordinal" on
`order_paid`. §3.5's literal `order_paid` properties are `order_id,
listing_id, category_id, amount_kobo, commission_kobo, is_repeat_buyer` —
no ordinal, only the boolean `is_repeat_buyer`, which Decision #59 (Prompt
14) already confirmed is the PRD's actual, deliberate choice over a
numeric ordinal. Re-affirmed here rather than silently re-litigated,
since the same request resurfacing in a later prompt's brief is worth a
pointer back to the original reasoning, not a fresh debate.
**Revisit:** No, unless the PRD itself is amended to add a numeric buyer
order ordinal explicitly — Decision #59's original terms.

### 106. Analytics is two modules, not one — `track-client.ts` (posthog-js) and `track-server.ts` (posthog-node) — because almost every event in this codebase fires server-side, and the two SDKs can't share one isomorphic implementation
**Why:** a survey of every existing `track()` call site (21 events, ~25
call sites) found only 4 are genuinely client-interaction events
(`listing_draft_started`, `list_another_clicked`, `support_contact_opened`,
`rating_prompt_shown`'s on-page-view leg) — everything else fires from a
server action or route handler, since almost every mutation in this
codebase is one. `posthog-node` has Node-only dependencies that cannot be
safely imported into a client bundle (even behind a runtime `typeof
window` check — bundlers still need to statically resolve the import
unless using framework-specific server/client boundary primitives), so a
single universal `track()` isn't safely isomorphic without real risk of
either breaking the client bundle or silently pulling Node internals into
it. Split into two modules with the identical exported name `track` (so
each call site's code reads identically regardless of which one it
imports) mirrors this codebase's own established precedent
(`src/lib/supabase/client.ts` vs `server.ts` vs `service.ts`) rather than
inventing a new pattern. Client `track()` takes 2 args (event,
properties) — posthog-js manages `distinctId`/session automatically.
Server `track()` takes a required 3rd `distinctId` arg — there is no
ambient "current session" server-side the way there is in the browser.
**Revisit:** No.

### 107. Server-side event capture creates a fresh PostHog client and immediately calls `shutdown()` on every single call, rather than sharing one long-lived client
**Why:** Vercel serverless functions can freeze the instant a response is
sent; `posthog-node` buffers captured events internally rather than
sending them synchronously, so a capture issued right before a server
action or route handler returns can be silently dropped without an
explicit flush. `client.shutdown()` flushes the queue and is the
documented way to guarantee delivery in a short-lived serverless
invocation. The cost is one extra HTTP round trip per event versus a
shared, long-lived client (which would need its own lifecycle management
this codebase has no natural place to hang) — an acceptable tradeoff at
this project's volume for correctness over throughput, same posture this
project already took for Resend (`sendEmail`, one send per call, no
connection pooling infrastructure built either).
**Revisit:** If event volume ever becomes a real cost/latency concern,
revisit sharing a client across a single request's multiple `track()`
calls (several call sites fire 2+ events) — not before there's a reason
to.

### 108. `distinctId` rule: the human whose action or outcome an event most directly concerns — not necessarily whoever's session happened to trigger it
**Why:** for state-described events (§3.5's own wording, e.g.
`order_released`: "Order reaches released," not "buyer/system releases
order"), `distinctId` is the event's natural subject — the seller for
`order_shipped`/`order_released`/`listing_*` events, the buyer for
`checkout_started`/`order_paid`/`order_delivered`/`order_disputed`/
`order_refunded`/`rating_*`/`contact_details_released`. For
actor-described events (§3.5's own wording names the actor explicitly,
e.g. `payout_marked_paid`: "Admin marks payout paid," `category_enabled`:
"Admin flips `browsable`"), `distinctId` is that actor — the admin, even
though the event's *consequence* affects a seller. This split is why
`order_released` uses `seller_id` even when a cron job or an admin
dispute-resolution triggered it (the identity of who caused a state
change doesn't change whose business outcome it's about), while
`payout_marked_paid` uses the admin's id even though the seller is who's
paid. `contact_detail_flagged` is the one property-threading exception:
its subject is whoever *submitted* the flagged text (the seller for a
listing, the buyer for a rating review) — `flagContactDetection()` gained
a required `actorId` parameter threaded from each of its three call sites
to make this correct rather than defaulting to a single convention.
**Revisit:** No — this is the resolved, documented rule; apply it to any
future event rather than re-deriving one ad hoc.

### 109. `listing_viewed` is deferred via `next/server`'s `after()`, the one call site where blocking on PostHog would be directly user-visible; anonymous visitors collapse to a shared `"anonymous"` distinctId
**Why:** every other `track()` call site is inside a server action or
route handler — a mutation's response, where a few hundred milliseconds of
added latency from an awaited PostHog round trip is unremarkable (the PRD
itself tolerates far more for email: "within 10 seconds"). `listing_viewed`
fires from a Server Component's render body — awaiting it there would
directly slow down the page itself, the one place this project's own
performance-conscious history (Lighthouse LCP concerns, Decision #66's
crash-prevention work) would treat that as a real regression. `after()`
schedules the capture to run once the response has already been sent,
guaranteed to complete on Vercel's serverless runtime (`waitUntil`
support) without blocking render. Anonymous (signed-out) visitors have no
stable per-visitor id anywhere in this codebase — no cookie-based
anonymous-id thread from client to server exists — so they collapse to a
literal `"anonymous"` distinctId string, a known, documented simplification
(the event's own properties — `referrer_surface`, `category_id` — are
still captured correctly per-event regardless; only cross-visit identity
resolution for anonymous traffic is lost).
**Revisit:** If per-visitor anonymous identity ever matters (e.g., funnel
analysis from first view to purchase for a not-yet-signed-in visitor),
this needs real session-id forwarding infrastructure — out of this
prompt's scope.

### 110. Server-fired events carry no `session_id` — a real, accepted gap, not a fabricated value
**Why:** §3.5 states "All events carry `user_id`, `timestamp`,
`session_id`," which is literally true only for posthog-js's own
browser-session concept (automatic, zero code needed for the 4 genuinely
client-fired events). The large majority of this codebase's events fire
server-side with no browser session to attach a `session_id` to at all —
building that correlation would require forwarding a client-generated
session identifier into every server action and route handler call
(reading `posthog.get_session_id()` client-side, threading it through
every mutation), a real, separate piece of infrastructure this prompt does
not build. Rather than invent a fake session id (a UUID with no actual
session behind it, which would misrepresent the data to anyone querying
PostHog later), server-fired events simply don't carry one — an honest gap,
documented here and in `track-server.ts`'s own module comment, not
silently papered over.
**Revisit:** Yes, if session-level funnel analysis across server-fired
events becomes a real product need — build the forwarding mechanism then,
informed by which specific funnels actually need it.

### 111. No "delivered" email exists — only `shipped` and `released` have PRD-specified email touchpoints, despite the task brief listing "shipped, delivered, released: the relevant party"
**Why:** re-read every Epic D AC mentioning email explicitly (grepped the
whole PRD for "email"/"notified"): §10 Epic D3 AC5 says "Buyer notified by
email on ship"; §10 Epic D4 AC7 says "Seller notified on release." Epic
D4's own AC6 — the one covering the `delivered` transition — only says
"`order_delivered` and `order_released` fire," with no email language at
all attached to `delivered` specifically. The brief's "delivered: the
relevant party" doesn't correspond to any literal PRD text. Resolved by
omission, same posture as every other citation-drift decision: no
`OrderDeliveredEmail` template was built, and no call site sends one.
**Revisit:** No, unless a future PRD revision explicitly adds a
delivered-transition email AC.

### 112. `order_released`'s seller email and the buyer's rating-prompt email both fire from the one shared `trackOrderReleased()` helper, not duplicated per call site
**Why:** §10 Epic D4 AC7 ("seller notified on release") and §10 Epic D6
AC10 ("buyer emailed a rating prompt on release") are the same trigger
moment for two different recipients. `trackOrderReleased()`
(`src/lib/orders/order-events.ts`) was already the single shared function
behind all three paths that can reach `released` (buyer early release,
the 72-hour auto-release cron, and — since Prompt 19 — admin
dispute-resolution-for-seller); extending it to send both emails, rather
than adding the calls at each of the three individual call sites, means
every release path gets identical, correct email behavior for free, with
no risk of one path being updated and another forgotten.
**Revisit:** No.

### 113. Dispute-opened admin notification needs a new `ADMIN_ALERT_EMAIL` env var, deliberately distinct from `NEXT_PUBLIC_SUPPORT_EMAIL`
**Why:** §10 Epic D5 AC6 requires "both parties and admin notified" on a
raised dispute. `NEXT_PUBLIC_SUPPORT_EMAIL` (existing since Prompt 11) is
the public, buyer-facing contact link on listing detail (§9.1's structural
support route) — reusing it for an internal operational alert would
conflate a public contact address with an internal ops inbox, two
genuinely different audiences and trust levels. `ADMIN_ALERT_EMAIL` is
server-only (never `NEXT_PUBLIC_`), and `sendDisputeOpenedEmails()`
no-ops that one leg (logged, not thrown) when it's unset — same "not
configured" posture as every other optional integration in this codebase,
verified live: the buyer and seller legs still send correctly with
`ADMIN_ALERT_EMAIL` unset.
**Revisit:** No.

### 114. Email send failures never block, roll back, or change the return value of the mutation they're attached to
**Why:** every sender call site in this prompt is a bare `await
send*Email(...)` with no error branch — a bounced or failed email must
never make `markShipped` fail, never make a webhook return a non-200
(which would make Paystack retry an already-successful payment
transition), and never make `resolveDispute` report failure after the
actual DB transition (and, on the refund path, the actual Paystack refund
call) already succeeded. `sendEmail()` itself catches every failure mode
internally and returns a `{ok:false}` result that no caller in this
prompt inspects — matching the same "best-effort side effect, never the
reason a real business operation fails" posture this codebase already
established for `flagContactDetection` (Prompt 9) and `track()` itself.
**Revisit:** No.

### 115. `@react-email/components` added as a real dependency; one shared `EmailLayout` wrapper, nine thin per-message templates rather than one generic parameterised template
**Why:** §12.1 names "React Email" as the stack choice, not just "Resend
with some HTML strings" — `@react-email/components` (Html, Body,
Container, Text, Heading, Hr, Preview) gives genuinely email-client-safe
building blocks rather than hand-rolled inline-styled divs that risk
breaking in Outlook/Gmail's stripped-down CSS support. One shared
`EmailLayout` (branding header/footer, consistent spacing) is reused by
every template — matching §13 Definition of Done item 14's "Template
copy: structure defined, wording not," this is that shared structure.
Nine separate template files (rather than one generic
heading/body/CTA-parameterised template) were chosen because the actual
data shapes genuinely differ in a way that matters: the two `order_paid`
emails carry structurally different contact-detail payloads (seller's
phone vs. buyer's full delivery block), and collapsing them into one
generic shape would either lose that distinction or need the same amount
of per-call-site conditional logic anyway, just relocated.
**Revisit:** No.
