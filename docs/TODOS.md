# TODOs

Deferred work items surfaced during plan/code review, not yet scheduled into a
specific prompt. Each entry keeps the reasoning, not just the task — a TODO
without context is worse than no TODO.

---

## 1. Unique constraint on `payout_accounts.profile_id`

**What:** A migration adding a unique index/constraint so a seller can hold at
most one `payout_accounts` row.

**Why:** `payout_accounts` has no such constraint today, so a seller could in
principle have more than one row (e.g. re-resolved a new bank account after a
mistake). Prompt 16's `release_order()` resolves "the seller's verified
payout account" (singular, per PRD §10 Epic D4 AC3) by picking the
most-recently-created verified row — correct for the realistic case, but a
convention, not a DB-enforced invariant.

**Pros:** Eliminates an entire class of "which account did we mean" ambiguity
at the schema level instead of by query convention.

**Cons:** Needs a data-cleanup step first if any live seller already has 2+
rows. Touches Epic A3's table and action code (`resolveAndSavePayoutAccount`),
not Epic D4's — out of Prompt 16's scope.

**Depends on / blocked by:** None strictly, but should land before Epic A3
ever gets a UI flow for adding a second bank account (none exists today).

**Context:** Surfaced during Prompt 16's `/plan-eng-review` (Issue 3,
2026-07-30) — see `docs/DECISIONS.md` for the resolution ("most recent
verified row" chosen over building this now).

---

## 2. Persisted Postgres-integration test suite (gated, once CI exists)

**What:** A vitest file, env-var-gated, that hits a real local/CI Supabase
instance to exercise order-lifecycle RPC behavior (`mark_order_paid`,
`mark_order_shipped`, `confirm_order_delivered`, `release_order`,
`expire_pending_order`, `auto_advance_shipped_to_delivered`) — run separately
from the plain `npm run test`, which must keep working with zero external
dependencies.

**Why:** Every one of these functions has been verified exactly once, by hand,
during the prompt session that introduced or last touched it (documented in
`docs/HANDOFF.md` as "verified live") — never as a persisted regression test.
Acceptable for a solo-dev, no-CI project across 15 prompts so far, but a real
gap the moment a second contributor or a CI pipeline shows up: nothing catches
an accidental regression to the money-release path automatically.

**Pros:** Would catch a future accidental regression in the order-lifecycle
RPCs without requiring a human to re-verify by hand every time one is touched.

**Cons:** Needs a CI pipeline and an env-gating convention to exist first —
neither does today. Real setup cost, not a quick add; `npm run test`'s
current "136/136, zero external deps" invariant must not silently break for
anyone who runs it without Docker/Supabase running.

**Depends on / blocked by:** A CI pipeline (doesn't exist) and an
env-gating convention for optional integration tests (doesn't exist).

**Context:** Surfaced during Prompt 16's `/plan-eng-review` Test Strategy
decision (2026-07-30) — the established 15-prompt convention (manual live
verification, documented in HANDOFF, not persisted) was kept for this prompt
specifically because of that same "no CI, no gating convention" gap.
