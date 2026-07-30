-- PRD §10 Epic D4 AC3/AC4/AC5, §8 (payout rules). Prompt 16.
--
-- Scope note: this prompt's own task described a "balance" query (sum of
-- seller_payout_kobo across released orders not covered by any payout) and
-- justified it as serving a future admin payout queue. Checked via
-- /plan-eng-review + an independent outside-voice pass before writing any
-- code: that spec is not PRD-sourced, becomes meaningless the instant every
-- released order gets an immediate payout row (which is exactly what this
-- migration makes true), and the outside voice caught that its stated
-- justification cited a nonexistent epic ("E7") — the real admin payout
-- queue is §10 Epic E3, whose actual ACs need a per-payout list (AC1) plus
-- a total *across all sellers* (AC7), not a per-seller queued-sum function.
-- Cut entirely per your decision; see docs/DECISIONS.md and docs/TODOS.md.
--
-- =============================================================================
-- payouts: payout_account_id becomes nullable, new is_blocked column
-- =============================================================================
-- PRD §7.1's literal table (and the original migration, Prompt 5) specify
-- payout_account_id as NOT NULL. But §10 Epic D4 AC4 requires creating the
-- queued payout row even when the seller has ZERO payout_accounts rows at
-- all (not just an unverified one) — nothing to reference in that case.
-- Same class of deliberate PRD-literal deviation as Decision #54
-- (orders.listing_id's blanket UNIQUE). Flagged via /plan-eng-review before
-- building, not silently changed.
alter table public.payouts
  alter column payout_account_id drop not null;

-- Snapshotted once, at insert time, by release_order() below — not derived
-- via a join at every read site. Matches this schema's existing philosophy
-- of snapshotting facts at creation (commission_kobo, seller_payout_kobo):
-- true when the seller has no payout_accounts row at all, or the row that
-- was resolved is not verified. Lets a future admin payout queue (§10 Epic
-- E3 AC2: "flagged and not actionable") filter `where is_blocked` with no
-- join. Known, accepted tradeoff: if the seller verifies their account
-- after this payout row already exists, the snapshot does not retroactively
-- flip — same behavior every other snapshotted column in this schema
-- already has.
alter table public.payouts
  add column is_blocked boolean not null default false;

comment on column public.payouts.payout_account_id is
  'Nullable: NULL means the seller had no payout_accounts row at all when this payout was created. See is_blocked.';
comment on column public.payouts.is_blocked is
  'Snapshotted at insert time by release_order(): true when payout_account_id is NULL or the referenced account was not verified at creation time. Never retroactively updated.';

-- =============================================================================
-- release_order(): rewritten to create the payout row atomically, in the
-- same transaction as the delivered -> released transition — never as a
-- follow-up TypeScript step, per AC3's "created by the release path,
-- never by an admin action." Both the buyer early-release action
-- (releaseOrder) and the 72-hour cron auto-release already call this exact
-- same function (Prompt 15), so this single rewrite satisfies AC5 ("the
-- same path") with no changes needed to either TypeScript call site beyond
-- a stale comment.
-- =============================================================================
create or replace function public.release_order(
  p_order_id uuid,
  p_actor_role text,
  p_actor_id uuid default null
)
returns setof public.orders
language plpgsql
as $$
declare
  v_seller_id uuid;
  v_seller_payout_kobo integer;
  v_account_id uuid;
  v_account_verified boolean;
begin
  if p_actor_role not in ('buyer', 'system') then
    raise exception 'release_order: invalid actor_role %', p_actor_role;
  end if;

  update public.orders
  set status = 'released',
      released_at = now()
  where id = p_order_id
    and status = 'delivered'
    and (p_actor_role = 'system' or buyer_id = p_actor_id)
  returning seller_id, seller_payout_kobo into v_seller_id, v_seller_payout_kobo;

  if not found then
    return;
  end if;

  insert into public.order_status_transitions (order_id, from_status, to_status, actor_role, actor_id, note)
  values (
    p_order_id, 'delivered', 'released', p_actor_role,
    case when p_actor_role = 'system' then null else p_actor_id end,
    case
      when p_actor_role = 'buyer' then 'Buyer released funds early'
      else 'Auto-released after the delivered window elapsed with no dispute'
    end
  );

  -- §10 Epic D4 AC3: "referencing the seller's verified payout account."
  -- No unique constraint exists on payout_accounts.profile_id (tracked in
  -- docs/TODOS.md #1, out of this prompt's scope), so a seller could in
  -- principle have more than one verified row — resolve to the most
  -- recently created one. `id desc` is a deterministic tiebreaker on a
  -- same-timestamp collision, at zero cost.
  select id, is_verified into v_account_id, v_account_verified
  from public.payout_accounts
  where profile_id = v_seller_id and is_verified = true
  order by created_at desc, id desc
  limit 1;

  -- §10 Epic D4 AC4: still create the queued payout even with no verified
  -- account — v_account_id is NULL in that case, is_blocked is true.
  insert into public.payouts (order_id, seller_id, payout_account_id, amount_kobo, is_blocked)
  values (
    p_order_id,
    v_seller_id,
    v_account_id,
    v_seller_payout_kobo,
    v_account_id is null or not coalesce(v_account_verified, false)
  );

  return query select * from public.orders where id = p_order_id;
end;
$$;

revoke execute on function public.release_order(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.release_order(uuid, text, uuid) to service_role;
