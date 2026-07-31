-- PRD §10 Epic E3 (payout queue), §8 (escrow-lite, §8.3 commission/payout
-- amount), §7.1 (payouts table), §11.2 (markPayoutPaid/markPayoutFailed).
-- Prompt 20.
--
-- Note on citation drift in this prompt's own task brief (resolved in favor
-- of the PRD text, same posture as Decisions #21/#26/#35/#54/#83/#84):
-- the brief says markPayoutPaid "sets completed" and transitions the
-- constituent orders to a "paid_out" status — §7.1's `payouts.status` enum
-- is `queued`/`held`/`paid`/`failed` (no `completed`), §10 Epic E3 AC3 says
-- literally "Sets `paid`, `paid_at`, `paid_by`," and §8.1's order state
-- machine is a closed, exhaustively-listed 9-value set with no `paid_out`
-- anywhere in it — payout completion is entirely a `payouts`-table event,
-- orders stay `released` forever afterward. Similarly, the brief's
-- `payout_completed` event doesn't exist in §3.5's table; the real event is
-- `payout_marked_paid` (already scaffolded in src/lib/analytics/events.ts
-- since Prompt 19 with exactly the properties E3 AC5 asks for). Both
-- corrected below and in the TypeScript that calls into this migration.

-- =============================================================================
-- HARD RULE (this prompt's task, and the textual signal inside it): "a
-- single order can NEVER appear in two non-failed payouts" — note the
-- explicit "non-failed" carve-out, which would be meaningless under a
-- blanket UNIQUE (that already guarantees "never in two payouts, full
-- stop," failed or not). Read together with §10 Epic E3 AC4 ("returns the
-- payout to `queued` on retry"), this is the same shape Decision #54
-- already established for `orders.listing_id`: a failed attempt is kept as
-- its own permanent historical row (never mutated back to `queued` in
-- place — see mark_payout_failed() below, which creates a fresh row for
-- the retry rather than reusing the failed one), and the uniqueness
-- constraint must exclude 'failed' rows so a retry's new row can actually
-- be inserted.
-- =============================================================================
alter table public.payouts drop constraint payouts_order_id_key;

create unique index payouts_order_id_active_unique
  on public.payouts (order_id)
  where status <> 'failed';

comment on index public.payouts_order_id_active_unique is
  'PRD (Prompt 20 task): "a single order can never appear in two non-failed payouts." Replaces the blanket UNIQUE on order_id — failed rows are excluded so mark_payout_failed()''s retry row can be inserted for the same order, while at most one queued/held/paid row may ever exist for it at a time.';

-- =============================================================================
-- mark_payout_paid(): §10 Epic E3 AC3. Guards on both status='queued' (the
-- actual state-machine transition — never mark an already-paid or
-- already-failed row paid) and is_blocked=false (AC2: "not actionable" —
-- defense in depth alongside the UI's own disabled state, matching this
-- schema's established belt-and-suspenders posture, e.g. Zod + a DB CHECK).
-- =============================================================================
create or replace function public.mark_payout_paid(
  p_payout_id uuid,
  p_admin_id uuid,
  p_reference text
)
returns setof public.payouts
language plpgsql
as $$
begin
  update public.payouts
  set status = 'paid',
      paid_at = now(),
      paid_by = p_admin_id,
      admin_reference = p_reference
  where id = p_payout_id
    and status = 'queued'
    and is_blocked = false;

  if not found then
    return;
  end if;

  return query select * from public.payouts where id = p_payout_id;
end;
$$;

revoke execute on function public.mark_payout_paid(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payout_paid(uuid, uuid, text) to service_role;

-- =============================================================================
-- mark_payout_failed(): §10 Epic E3 AC4. The failing row is set to 'failed'
-- and kept, permanently, as the historical record of that attempt
-- (failure_note intact) — never mutated back to 'queued' in place, per the
-- "non-failed" reasoning above. A fresh 'queued' row is inserted for the
-- same order in the same transaction, re-resolving payout_account_id/
-- is_blocked from scratch (identical lookup to release_order()/
-- resolve_dispute_release()'s own payout-creation block) — the seller may
-- well have fixed the exact bank-detail problem that caused the failure
-- since the last attempt, and the retry should reflect that, not blindly
-- copy stale values forward.
--
-- This is not "admin creating a payout" in the sense HARD RULE #5
-- forbids (§11.2: "Admin does NOT create payouts... only marks them paid
-- or failed") — admin never chooses which order gets a payout or invents
-- one from nothing; this function only ever re-issues a fresh attempt for
-- an order that already, structurally, has exactly one payout lineage
-- (release_order/resolve_dispute_release are still the only places a
-- payout is ever created for a brand-new order).
-- =============================================================================
create or replace function public.mark_payout_failed(
  p_payout_id uuid,
  p_note text
)
returns setof public.payouts
language plpgsql
as $$
declare
  v_order_id uuid;
  v_seller_id uuid;
  v_amount_kobo integer;
  v_account_id uuid;
  v_account_verified boolean;
begin
  update public.payouts
  set status = 'failed',
      failure_note = p_note
  where id = p_payout_id
    and status = 'queued'
  returning order_id, seller_id, amount_kobo into v_order_id, v_seller_id, v_amount_kobo;

  if v_order_id is null then
    return;
  end if;

  -- No "who marked this failed" column exists on payouts (matching the
  -- literal §7.1 table — paid_by is the only admin-actor column it
  -- defines), so the calling admin's id isn't threaded into this function
  -- at all; the TypeScript action logs it for audit purposes instead, same
  -- posture as Decision #87 (hideReview's reason: recorded where the
  -- schema actually has a place for it, not force-fit elsewhere).
  select id, is_verified into v_account_id, v_account_verified
  from public.payout_accounts
  where profile_id = v_seller_id and is_verified = true
  order by created_at desc, id desc
  limit 1;

  insert into public.payouts (order_id, seller_id, payout_account_id, amount_kobo, is_blocked)
  values (
    v_order_id,
    v_seller_id,
    v_account_id,
    v_amount_kobo,
    v_account_id is null or not coalesce(v_account_verified, false)
  );

  return query select * from public.payouts where id = p_payout_id;
end;
$$;

revoke execute on function public.mark_payout_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payout_failed(uuid, text) to service_role;
