# Known Issues

Temporary problems, blockers, and technical debt. Append new items under the
prompt that introduced them; when something is fixed, mark it **RESOLVED
(Prompt N)** in place — don't delete the entry.

---

## From Prompt 2

1. **`database.types.ts` is hand-authored, not CLI-generated.**
   Docker is not installed in this environment (not just stopped — absent
   entirely, no colima/podman either), so `supabase gen types typescript
   --local` could not run. `src/lib/database.types.ts` was written by hand to
   mirror `20260727202617_profiles.sql`. Regenerate it for real as soon as
   Docker is available and diff against the hand-written version.
   **Status:** open.

2. **Migration `20260727202617_profiles.sql` has never been run against a real Postgres instance.**
   `supabase db reset` could not execute (same Docker gap as #1). The SQL is
   hand-reviewed but not execution-verified — table creation, the
   `handle_new_user` trigger, RLS policies, and the `profiles_public` view are
   all unconfirmed to actually apply cleanly.
   **Status:** open.

3. **Signup → trigger → `profiles` row creation is unverified end-to-end.**
   Depends on #2. Cannot confirm a real signup produces a matching `auth.users`
   + `profiles` row until the local stack runs.
   **Status:** open.

4. **Cross-account RLS is unverified.**
   Depends on #2. Cannot confirm `phone` and `payout_accounts` are actually
   inaccessible to a second signed-in user until tested against a running
   instance with two real accounts.
   **Status:** open.

5. **`/admin` middleware protection is "signed in" only, not "is admin."**
   Epic E5 AC1 requires non-admins get a 404 from `/admin`. No admin-role
   mechanism exists yet (PRD §15.5 B22 defers it to a future migration), so
   right now any authenticated user can reach past the middleware gate on
   `/admin` — there's nothing behind it yet, but the gate itself isn't real.
   **Status:** open. Must be closed when Epic E (Admin) is built.

6. **Avatar is a raw URL text field, not a file-upload pipeline.**
   No Supabase Storage bucket, RLS, or upload UI exists yet. `avatar_url`
   accepts any URL string as entered by the user.
   **Status:** open, low priority. No data-model change needed when this is
   built — `avatar_url` already accepts a Storage public URL.

7. **Epic A1 AC3 (unverified users blocked from publish/checkout) is not enforceable yet.**
   Listing publish (Epic B) and checkout (Epic D) don't exist yet, so there is
   nothing to gate. Not a bug — just sequencing. Revisit when those flows are
   built to ensure they check email-confirmation status.
   **Status:** open, blocked on Epic B/D.

## From Prompt 4

8. **Migration `20260727215742_categories_listings.sql` and `supabase/seed.sql` have never been run against a real Postgres instance.**
   Same Docker gap as #1/#2. Both files parse cleanly against a real
   PostgreSQL grammar (`libpg-query`), which is a genuine syntax check, but
   that's not the same as execution — trigger behavior, constraint
   enforcement, and the seed actually producing 5 rows are all unconfirmed
   against a live database.
   **Status:** open.

9. **No startup assertion links the category registry (`src/lib/categories/registry.ts`) to the `categories` table.**
   PRD §6.5 HARD RULE: *"a startup assertion verifies they match the
   registry. Divergence is a build failure."* `categories.photo_min` and
   `categories.allowed_conditions` are seeded to match the registry today,
   by hand, with nothing enforcing they stay in sync if either changes later.
   **Status:** open. Should be built once there's an app boot path to hang
   the assertion on.

10. **`database.types.ts` now covers 4 tables + 1 view, all hand-authored.**
    Extends issue #1 — every prompt that adds schema without Docker widens
    the gap between this file and what the CLI would actually generate.
    **Status:** open, growing.

11. **The `listings_flaw_photo_required_when_used` and `listings_condition_notes_required_when_used` CHECK constraints are the only DB-level enforcement of §6.3's "used requires evidence" rule; the Zod side (category attribute schemas, Prompt 3) doesn't validate `condition_notes`/`flaw_photo_indexes` at all**, since those are real `listings` columns, not category `attributes` JSONB, and were out of scope for Prompt 3's category-registry resolver.
    **Status:** open. The listing-creation server action (a future prompt) needs its own Zod schema for the listing-level fields (`title`, `description`, `condition_notes`, `flaw_photo_indexes`, `photo_urls`) that composes with `resolveCategoryAttributes()` — the DB constraints are a backstop, not the primary validation layer.

12. **The admin-role verification mechanism (PRD §15.5 B22) doesn't exist yet — generalizing issue #5 beyond `/admin` middleware.**
    Every table's RLS summary in §7.2 says some version of "Admin all" /
    "Admin write only," implemented by the service-role client bypassing RLS
    entirely (correct and permanent — see `docs/DECISIONS.md` #7, #20). But
    nothing currently verifies a caller is actually an admin *before* a
    server action is allowed to reach for that client. `createServiceClient()`
    (Prompt 2) is guarded by `server-only`, which enforces the client/server
    bundle boundary only — it is not an authorization check. No admin
    claim/column exists on `profiles` yet, and no reusable "assert current
    user is admin" helper exists in code. This currently affects `categories`
    and `listings` (this prompt) and will affect `orders`, `disputes`,
    `payouts`, and `moderation_flags` (next prompt) identically.
    **Status:** open. Must be closed when Epic E (Admin) is built — the
    admin claim/column and a reusable admin-check helper need to land
    *before* any admin server action is written, not after.

## From Prompt 5

13. **Migration `20260728100239_orders_and_related.sql` has never been run against a real Postgres instance.**
    Same Docker gap as #1/#2/#8. Parses cleanly against a real PostgreSQL
    grammar (`libpg-query`), which is a genuine syntax check but not
    execution — the RLS policies, all CHECK constraints, and the
    `ratings_public` view's hide-on-`is_hidden` logic are unconfirmed
    against a live database.
    **Status:** open.

14. **No read-side projection hides `orders.delivery_name`/`delivery_state`/`delivery_address`/`delivery_phone` until `status = 'paid'`.**
    These columns are `NOT NULL` from order creation (the buyer supplies them
    at checkout) but PRD §9.1 requires they stay invisible to the seller
    until `paid`. This is the same column-level-privacy problem already
    solved twice — `profiles.phone` via `profiles_public` (Prompt 2),
    `ratings.review` via `ratings_public` (this prompt) — recurring a third
    time on `orders`, and not yet addressed here.
    **Status:** open. Needs an `orders`-scoped equivalent (a view, or
    explicit column selection in the order-detail server action) before any
    order-read path is built — don't let a future prompt `SELECT *` this
    table for a buyer-facing or pre-`paid` seller-facing view.

15. **`orders.tracking_note`'s "≥3 characters, required when marking shipped" rule (Epic D3 AC2) has no database-level enforcement.**
    Unlike `listings.condition_notes`, the PRD doesn't use "enforced by...
    database constraint" language for this one, so it was left entirely to
    the future ship-transition server action — consistent with this
    migration's "no business logic yet" scope.
    **Status:** open, by design. Revisit only if a future prompt decides
    this specific rule also needs a DB-level backstop.

## From Prompt 6

16. **`recompute_seller_rating`'s `SECURITY DEFINER` boundary is correct by RLS-policy inspection, not by execution.**
    Migration `20260728102304_triggers.sql` has never run against a real
    Postgres instance (same Docker gap as #1/#2/#8/#13). The reasoning for
    why this one trigger needs `SECURITY DEFINER` and the other two don't
    (see `docs/DECISIONS.md` #28) is sound on paper — traced against
    Prompt 5's actual RLS policies, not assumed — but hasn't been confirmed
    by actually inserting a rating as a non-service-role authenticated user
    and checking the seller's `profiles` row updates.
    **Status:** open. Verify with two real accounts once Docker exists:
    buyer inserts a rating, seller's `rating_count`/`rating_average` update
    despite the buyer never having write access to the seller's profile row
    directly.

17. **Migration `20260728102304_triggers.sql` has never been run against a real Postgres instance.**
    Same Docker gap as #1/#2/#8/#13. Parses cleanly against a real
    PostgreSQL grammar (`libpg-query`) but that's syntax, not execution —
    none of this prompt's three triggers have fired against live data.
    **Status:** open.

## From Prompt 7

18. **Migration `20260728134156_listing_photos_storage.sql` has never been run against a real Postgres instance.**
    Same Docker gap as #1/#2/#8/#13/#17. Parses cleanly against a real
    PostgreSQL grammar but the bucket and its RLS policies on
    `storage.objects` have never been exercised — photo upload/read access
    is unverified end-to-end.
    **Status:** open.

19. **The §5.4 listing-limit gate has a TOCTOU race: count-then-insert isn't serialised.**
    `createListing` reads the seller's active published count, compares it
    to her tier cap, and only then inserts. Two near-simultaneous publish
    requests from the same seller sitting exactly at her cap could both
    read the same count and both pass, landing one listing over cap.
    Unlike `generate_unique_handle`/`recompute_seller_rating` (fixed in the
    prior review pass with `pg_advisory_xact_lock`), this check has no
    equivalent serialisation — it's pure application-layer logic across two
    separate queries, not a single DB-enforced invariant.
    **Status:** open. Consider either an advisory lock scoped to the seller
    around the count-then-insert sequence, or a DB-level trigger that
    rejects the insert when the cap is already exceeded (mirroring how
    `condition_notes`/`flaw_photo_indexes` get a CHECK-constraint backstop
    in Prompt 4).

20. **The dynamic listing form doesn't reveal every conditionally-required attribute field — only the registry's `usageIndicatorFields`.**
    Fields gated by `product_type` (e.g. Gadgets' `imei_last_6` for
    phones/tablets, `storage_gb` for phones/tablets/laptops/consoles) or by
    a non-`condition` flag (Home Goods' `functional_status` under
    `is_powered`) always render once a category is picked, rather than
    being progressively revealed. Deriving arbitrary conditional-requiredness
    generically from a Zod shape isn't feasible without parsing
    `superRefine` internals, which Zod doesn't expose introspectably.
    **Status:** open, by design — a UX guidance gap only. Server-side
    enforcement (the category resolver, Prompt 3) is complete and
    unaffected; a seller who skips a required field simply sees a
    validation error on submit rather than the field never having been
    shown as optional.

21. **No listing-management surface exists yet** (view own listings, edit, remove, "list another").
    Out of scope for this prompt by design — Epic B2 (draft autosave,
    "list another," the PRD's stated growth mechanism) and B4 (manage
    listings) are explicitly the next prompt's job.
    **Status:** RESOLVED (Prompt 8). `updateListing`/`removeListing` server
    actions, edit/resume mode in `/sell`, localStorage autosave, "list
    another," and `/dashboard/listings` all now exist.

## From Prompt 8

22. **`listings` has no `view_count` column.** PRD Epic B4 AC1: "Seller
    dashboard lists own listings with status, view count, and age."
    `src/lib/database.types.ts` (hand-authored, issue #1/#10) has no such
    column, and no migration has ever added one — view tracking was never
    built in any prior prompt. `/dashboard/listings` (this prompt) shows
    status, category, price, and age, but omits view count entirely rather
    than fabricating a value or silently mislabeling age as views.
    **Status:** open. Needs a `listing_viewed`-driven counter (or a
    read-time aggregate over an events table) plus a migration before AC1
    is fully met — out of scope for this prompt, which only builds the
    management surface, not view analytics.

23. **The §5.4 listing-limit gate's TOCTOU race (issue #19) is now duplicated in `updateListing`'s draft→publish path.**
    `checkListingLimitGate` (extracted this prompt from `createListing`'s
    inline check, see `docs/DECISIONS.md` — shared helper) is called
    identically from both `createListing` and `updateListing`. Sharing the
    helper means the fix, when it lands, closes the race in both call
    sites at once — but until then, publishing a draft has the exact same
    count-then-insert race as a fresh publish.
    **Status:** open, same remedy as #19 (advisory lock or DB-level
    trigger), now doubly motivating fixing it centrally rather than per
    call site.

24. **`/dashboard/listings` has no link from anywhere else in the app.**
    No global nav/header component exists yet in the codebase (confirmed —
    grepped for one before building this page), so there's nothing to add
    a link to. The page is reachable directly and is linked *from*
    (`listing-form.tsx`'s post-publish "Continue to dashboard"), but
    nothing currently links *to* it from, e.g., `/dashboard/profile`.
    **Status:** open, low priority. Revisit when a shared nav/header is
    built — not this prompt's scope to invent one.
