-- PRD §8 (state machine), §10 Epic D3/D4 (fulfilment, delivery and release).
-- Confirmed with the user before building (not assumed): `delivered` is a
-- real, persisting state — release happens via an explicit buyer action or
-- a scheduled auto-release after a window with no dispute, never in the
-- same instant as delivery confirmation. See docs/DECISIONS.md #61 for why
-- §10 Epic D4 AC2's literal "delivered transitions immediately to
-- released" is read as "automatic, no admin approval gate" rather than
-- "zero elapsed time" — the literal reading would make §10 Epic D5 AC1's
-- "dispute may be raised on... delivered" describe an unreachable state.
--
-- =============================================================================
-- order_status_transitions — the audit trail
-- =============================================================================
-- Not a PRD §7.1 table (grepped the whole PRD for "audit"/"transition
-- log"/"order_events" — zero hits, same as Decisions #21/#59's earlier
-- findings). Built anyway, deliberately, because this prompt's own
-- instructions are explicit and repeated ("every state transition is
-- recorded... no exceptions", "a transition without an audit record is a
-- bug") in a way Prompt 14's passing mention of "order_events" never was,
-- and because there is a genuine structural gap the existing `orders`
-- timestamp columns cannot close: §8.1's own state table lists `delivered`
-- as enterable by "Buyer, or auto release" — two different actors setting
-- the exact same `delivered_at` column, with nothing to disambiguate which
-- one happened after the fact. `expired` and `cancelled` have no dedicated
-- timestamp column on `orders` at all, so for those two, this table is the
-- *only* record of when the transition happened, not just of who did it.
create table public.order_status_transitions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  from_status text not null,
  to_status text not null,
  -- Free text, not FK'd to the orders status enum: mirroring the same
  -- unconstrained-text choice already made for webhook_events.event_type —
  -- this table is written exclusively by the trusted functions below, never
  -- from raw user input, so a duplicate enum here would only risk drifting
  -- out of sync with orders_status_enum.
  actor_role text not null,
  -- Null for actor_role = 'system' (cron-driven transitions have no human
  -- actor). Intentionally not a foreign key to auth.users directly — every
  -- other actor reference in this schema (orders.buyer_id, orders.seller_id)
  -- points at profiles, so this does too.
  actor_id uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now(),
  constraint order_status_transitions_actor_role_enum
    check (actor_role in ('buyer', 'seller', 'system'))
);

create index order_status_transitions_order_id_idx
  on public.order_status_transitions (order_id, created_at);

comment on table public.order_status_transitions is
  'Not in PRD §7.1 — built in Prompt 15 because the task instructions for that prompt were explicit and repeated ("no exceptions"), and because orders.delivered_at cannot by itself disambiguate "buyer confirmed" from "auto release advanced it." See docs/DECISIONS.md #61.';

alter table public.order_status_transitions enable row level security;

-- Buyer/seller of the order may read its own transition history — needed
-- for the order-detail page this prompt builds (item 6). No insert/update/
-- delete policy for authenticated/anon: every row is written exclusively by
-- the SECURITY-restricted functions below, via the service-role client,
-- same "system of record" posture as orders itself (§7.2).
create policy "order_status_transitions_select_participant"
  on public.order_status_transitions for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
    )
  );

-- Table-level GRANT — not optional even with a correct RLS policy above.
-- Postgres checks table-level grants BEFORE evaluating RLS, so without
-- this, every read attempt fails with "permission denied for table
-- order_status_transitions" regardless of the policy — exactly the class
-- of bug 20260729055455_grant_table_privileges.sql (the un-numbered
-- session between Prompts 8 and 9) already found and fixed for every other
-- table in this schema. Caught live during this prompt's own verification
-- (docs/DECISIONS.md #64) — a fresh reminder that this step is easy to
-- forget on a brand new table even with that precedent already documented.
grant select on public.order_status_transitions to authenticated;

-- =============================================================================
-- Defense in depth: tracking_note, once set, must be meaningful (§10 Epic
-- D3 AC2 — "requires a tracking_note of 3 or more characters"). Enforced by
-- Zod at the server-action boundary; this is the same "belt and suspenders"
-- pattern as condition_notes' DB-level CHECK (Prompt 4).
-- =============================================================================
alter table public.orders
  add constraint orders_tracking_note_length
  check (tracking_note is null or char_length(trim(tracking_note)) >= 3);

-- =============================================================================
-- Atomic transition functions. Every one follows mark_order_paid's
-- established shape (Prompt 14, Decision #60): `returns setof orders`, an
-- UPDATE conditioned on the exact expected prior status (this IS the "only
-- allowed transitions in §8's table may occur" enforcement — a row that
-- isn't in the expected status simply doesn't match, zero rows update, the
-- function returns nothing), and EXECUTE revoked from every role except
-- service_role. None are SECURITY DEFINER, for the same reason
-- mark_order_paid isn't: the only intended caller is server-side code using
-- the service-role client, which already has full access.
--
-- Time windows (7-day auto_release_at, the 30-minute pending cutoff, the
-- 72-hour delivered cutoff) are never hardcoded in this SQL — every
-- function that needs a deadline takes it as a `timestamptz` parameter,
-- computed by the TypeScript caller from the single source of truth,
-- src/lib/orders/timing-config.ts. This file has no literal "30", "7", or
-- "72" anywhere in it, on purpose.
-- =============================================================================

create or replace function public.mark_order_shipped(
  p_order_id uuid,
  p_seller_id uuid,
  p_tracking_note text,
  p_auto_release_at timestamptz
)
returns setof public.orders
language plpgsql
as $$
begin
  update public.orders
  set status = 'shipped',
      shipped_at = now(),
      auto_release_at = p_auto_release_at,
      tracking_note = p_tracking_note
  where id = p_order_id
    and seller_id = p_seller_id
    and status = 'paid';

  if not found then
    return;
  end if;

  insert into public.order_status_transitions (order_id, from_status, to_status, actor_role, actor_id, note)
  values (p_order_id, 'paid', 'shipped', 'seller', p_seller_id, p_tracking_note);

  return query select * from public.orders where id = p_order_id;
end;
$$;

revoke execute on function public.mark_order_shipped(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_order_shipped(uuid, uuid, text, timestamptz) to service_role;

create or replace function public.confirm_order_delivered(
  p_order_id uuid,
  p_buyer_id uuid
)
returns setof public.orders
language plpgsql
as $$
begin
  update public.orders
  set status = 'delivered',
      delivered_at = now()
  where id = p_order_id
    and buyer_id = p_buyer_id
    and status = 'shipped';

  if not found then
    return;
  end if;

  insert into public.order_status_transitions (order_id, from_status, to_status, actor_role, actor_id, note)
  values (p_order_id, 'shipped', 'delivered', 'buyer', p_buyer_id, 'Buyer confirmed delivery');

  return query select * from public.orders where id = p_order_id;
end;
$$;

revoke execute on function public.confirm_order_delivered(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_order_delivered(uuid, uuid) to service_role;

-- Handles both the buyer's optional early release (item 3) and the
-- 72-hour auto-release cron (item 4's third window) — the state transition
-- is identical; only the audit actor differs. p_actor_id is null when
-- p_actor_role = 'system'.
create or replace function public.release_order(
  p_order_id uuid,
  p_actor_role text,
  p_actor_id uuid default null
)
returns setof public.orders
language plpgsql
as $$
begin
  if p_actor_role not in ('buyer', 'system') then
    raise exception 'release_order: invalid actor_role %', p_actor_role;
  end if;

  update public.orders
  set status = 'released',
      released_at = now()
  where id = p_order_id
    and status = 'delivered'
    and (p_actor_role = 'system' or buyer_id = p_actor_id);

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

  return query select * from public.orders where id = p_order_id;
end;
$$;

revoke execute on function public.release_order(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.release_order(uuid, text, uuid) to service_role;

-- §10 Epic D1 AC9: "A pending order older than 30 minutes is set to
-- expired... freeing the listing." Flips the listing back to published in
-- the same transaction — a pending order can only ever exist against a
-- still-published listing (hasBlockingOrder, Prompt 8/13, blocks
-- removeListing/updateListing while any non-cancelled/non-expired order
-- exists), so this is always a safe, correct unconditional set, not a
-- guess.
create or replace function public.expire_pending_order(p_order_id uuid)
returns setof public.orders
language plpgsql
as $$
declare
  v_listing_id uuid;
begin
  update public.orders
  set status = 'expired'
  where id = p_order_id and status = 'pending'
  returning listing_id into v_listing_id;

  if v_listing_id is null then
    return;
  end if;

  update public.listings
  set status = 'published'
  where id = v_listing_id;

  insert into public.order_status_transitions (order_id, from_status, to_status, actor_role, actor_id, note)
  values (p_order_id, 'pending', 'expired', 'system', null, 'Expired: payment not completed within the pending window');

  return query select * from public.orders where id = p_order_id;
end;
$$;

revoke execute on function public.expire_pending_order(uuid) from public, anon, authenticated;
grant execute on function public.expire_pending_order(uuid) to service_role;

-- §10 Epic D4 AC5: "A scheduled job releases shipped orders past
-- auto_release_at that are not disputed, following the same path" — "the
-- same path" as a buyer's manual confirm_order_delivered: this function
-- performs the identical shipped -> delivered transition (not shipped ->
-- released directly), so the resulting delivered order is then subject to
-- the exact same 72-hour delivered-window handling as any buyer-confirmed
-- delivery, whichever actor got it there.
create or replace function public.auto_advance_shipped_to_delivered(p_order_id uuid)
returns setof public.orders
language plpgsql
as $$
begin
  update public.orders
  set status = 'delivered',
      delivered_at = now()
  where id = p_order_id and status = 'shipped';

  if not found then
    return;
  end if;

  insert into public.order_status_transitions (order_id, from_status, to_status, actor_role, actor_id, note)
  values (p_order_id, 'shipped', 'delivered', 'system', null, 'Auto-advanced to delivered: 7-day auto_release_at elapsed with no dispute');

  return query select * from public.orders where id = p_order_id;
end;
$$;

revoke execute on function public.auto_advance_shipped_to_delivered(uuid) from public, anon, authenticated;
grant execute on function public.auto_advance_shipped_to_delivered(uuid) to service_role;
