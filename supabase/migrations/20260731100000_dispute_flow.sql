-- PRD §10 Epic D5 (every AC), §8.4 (why shipping_cost_dispute exists), §2.5/§3.5
-- (order_disputed). Prompt 17.
--
-- Scope note: `disputes` itself (table, RLS, the correct 7-value reason
-- enum including shipping_cost_dispute) was already built in Prompt 5
-- (Decision #23) — this migration only narrows one policy and adds the
-- atomic transition function. Routed through /plan-eng-review before any
-- code was written, given this is money-adjacent (holding a queued payout)
-- and touches the atomic order-lifecycle RPCs from Prompts 15/16. See
-- docs/DECISIONS.md for the resolved decisions and the outside-voice
-- findings (a hardcoded SQL time window and a disproven "race window"
-- justification, both caught before this file was written).

-- =============================================================================
-- payouts.status gains 'held' — kept as a HARD-RULE safety net (§10 Epic D5
-- AC3: "a disputed order can never produce a paid payout") even though,
-- given release_order() is the only payout creator and it only fires on
-- status='delivered' (mutually exclusive with raise_dispute()'s own guard
-- below), a payout provably cannot exist yet when a dispute is raised under
-- today's state machine — not a live race, a defense against a *future*
-- change (Prompt 19's resolveDispute, or a future loosening of
-- release_order()'s guard) accidentally creating exactly the scenario this
-- HARD RULE forbids. Orthogonal to Prompt 16's is_blocked (payout-account
-- verification), a different axis entirely.
-- =============================================================================
alter table public.payouts drop constraint payouts_status_enum;
alter table public.payouts add constraint payouts_status_enum
  check (status in ('queued', 'held', 'paid', 'failed'));

comment on column public.payouts.status is
  'queued: awaiting admin payout. held: a dispute was raised on this order (§10 Epic D5 AC3) — currently unreachable given release_order() only fires on delivered, kept as a safety net against future state-machine changes. paid/failed: admin-resolved.';

-- =============================================================================
-- disputes_insert_participant (Prompt 5) narrowed to buyer-only. §10 Epic D5
-- AC1: "Buyer may raise a dispute" — the original policy allowed either
-- party to insert, which the app-level raiseDispute check alone cannot
-- close (RLS gates a direct client-side insert regardless of what the
-- server action does).
-- =============================================================================
drop policy "disputes_insert_participant" on public.disputes;

create policy "disputes_insert_buyer_only"
  on public.disputes for insert
  to authenticated
  with check (
    raised_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = disputes.order_id and o.buyer_id = auth.uid()
    )
  );

-- =============================================================================
-- raise_dispute(): atomic, same shape as mark_order_shipped/
-- confirm_order_delivered/release_order (Prompt 15/16) — EXECUTE revoked
-- from every role but service_role, WHERE status = <expected> is the
-- actual transition guard, an order_status_transitions row is written in
-- the same transaction (Decision #62's "every transition is audit-
-- recorded, no exceptions," applied here, not re-litigated).
--
-- p_window_days is a parameter, not a hardcoded interval — matching this
-- migration file's own established rule (see the header comment on
-- release_order() etc. in 20260729110000_order_transitions.sql): "Time
-- windows... are never hardcoded in this SQL... every function that needs
-- a deadline takes it as a parameter, computed by the TypeScript caller
-- from... timing-config.ts."
-- =============================================================================
create or replace function public.raise_dispute(
  p_order_id uuid,
  p_buyer_id uuid,
  p_reason text,
  p_detail text,
  p_evidence_urls text[],
  p_window_days integer
)
returns setof public.disputes
language plpgsql
as $$
declare
  v_dispute_id uuid;
  v_prior_status text;
begin
  -- Pre-image read: the UPDATE below overwrites status, so the prior value
  -- (paid/shipped/delivered) must be captured first for the audit row.
  select status into v_prior_status from public.orders where id = p_order_id;

  update public.orders
  set status = 'disputed',
      disputed_at = now()
  where id = p_order_id
    and buyer_id = p_buyer_id
    and status in ('paid', 'shipped', 'delivered')
    and (delivered_at is null or now() <= delivered_at + make_interval(days => p_window_days));

  if not found then
    return;
  end if;

  insert into public.disputes (order_id, raised_by, reason, detail, evidence_urls)
  values (p_order_id, p_buyer_id, p_reason, p_detail, p_evidence_urls)
  returning id into v_dispute_id;

  insert into public.order_status_transitions (order_id, from_status, to_status, actor_role, actor_id, note)
  values (p_order_id, v_prior_status, 'disputed', 'buyer', p_buyer_id, 'Buyer raised a dispute: ' || p_reason);

  -- §10 Epic D5 AC3 / see the payouts.status comment above: kept as a
  -- HARD-RULE safety net even though provably unreachable under today's
  -- state machine — zero cost to handle in the same transaction regardless.
  update public.payouts
  set status = 'held'
  where order_id = p_order_id and status = 'queued';

  return query select * from public.disputes where id = v_dispute_id;
end;
$$;

revoke execute on function public.raise_dispute(uuid, uuid, text, text, text[], integer) from public, anon, authenticated;
grant execute on function public.raise_dispute(uuid, uuid, text, text, text[], integer) to service_role;
