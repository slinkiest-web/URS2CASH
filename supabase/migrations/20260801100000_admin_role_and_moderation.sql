-- PRD §10 Epic E (E1 moderation queue, E2 dispute arbitration — E3 payout
-- queue and E4 category control are explicitly out of this prompt's scope,
-- next prompt), §11.2 (admin server actions + the HARD RULE that every
-- admin action re-verifies role from the DB), §9.3 (moderation queue
-- ordering), §5.4 (suspension/restriction), §7.2 (admin via service role
-- behind a guarded route group). Prompt 19.
--
-- =============================================================================
-- Admin role: a database column, never an env var list of emails (§10 Epic
-- E5 AC2). Lives on profiles, next to is_suspended — same shape, same
-- table, same "self-service can never touch this" protection extended
-- below. There is no admin-granting server action anywhere in this
-- codebase and there must never be one; the only way to become an admin is
-- scripts/promote-admin.ts, run manually with the service-role key. See
-- that file's own header comment for the full bootstrap story.
-- =============================================================================
alter table public.profiles
  add column is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'The only admin-role mechanism in this codebase (§10 Epic E5 AC2). Never settable via profiles_update_own — see prevent_profile_self_service_admin_fields below. Granted only by scripts/promote-admin.ts.';

-- =============================================================================
-- Suspension audit columns. §5.4 HARD RULE: "a suspended seller's listings
-- return 404 publicly and remain visible to her with the reason" — that
-- requires a persisted, retrievable reason, not just a status flip. Mirrors
-- the paid_by/resolved_by precedent already established on payouts/disputes.
-- =============================================================================
alter table public.listings
  add column suspension_reason text,
  add column suspended_at timestamptz,
  add column suspended_by uuid references public.profiles (id);

alter table public.profiles
  add column suspension_reason text,
  add column suspended_at timestamptz,
  add column suspended_by uuid references public.profiles (id);

comment on column public.listings.suspension_reason is
  '§10 Epic E1 AC2/AC3: set by admin_suspend_listing(). Shown to the listing''s own owner (listings_select_own already permits this); never shown publicly since a suspended listing 404s for everyone else.';
comment on column public.profiles.suspension_reason is
  'Set by suspendSeller. §7.1 has no PRD-specified reason column for account-level suspension (unlike listings, no AC requires it be shown to the seller) — kept anyway so the reason argument is not silently discarded, for admin audit and the future email call site (Prompt 22).';

-- =============================================================================
-- Real gap, closed here rather than left latent: `profiles_update_own` and
-- `listings_update_own` (Prompts 2 and 4) grant the row owner a full-row
-- UPDATE with no column-level restriction — RLS is row-level, not
-- column-level, same limitation decision #1/#24 already worked around for
-- SELECT with dedicated views. For UPDATE there is no equivalent "view"
-- escape hatch; the established pattern for column-level UPDATE protection
-- in this schema is a BEFORE UPDATE trigger comparing OLD/NEW
-- (prevent_published_listing_core_field_changes, Prompt 4). Until this
-- migration, nothing stopped an authenticated user from directly PATCHing
-- their own `is_suspended`, `listing_limit_override`, `rating_average`,
-- `completed_sales_count`, or (as of this migration) `is_admin` via the
-- client SDK, bypassing every server action entirely. Not previously
-- flagged because no admin-settable column existed before this prompt to
-- make the gap concrete — closing it now, in the same migration that
-- introduces the first such column, rather than shipping is_admin into a
-- table that already can't protect it.
--
-- Distinguishes "the row owner's own authenticated session" from "the
-- service role" the same way this schema already relies on elsewhere
-- (recompute_seller_rating's SECURITY DEFINER reasoning, Decision #28):
-- auth.uid() is non-null only inside a request carrying a real user JWT.
-- The service-role key (every admin server action, always) authenticates
-- as the service_role Postgres role directly and has no JWT — auth.uid()
-- is null in that context — so this trigger fires for a self-service PATCH
-- and never for a legitimate admin write, with zero changes needed at any
-- admin action call site.
-- =============================================================================
create function public.prevent_profile_self_service_admin_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and (
    new.is_admin is distinct from old.is_admin
    or new.is_suspended is distinct from old.is_suspended
    or new.suspension_reason is distinct from old.suspension_reason
    or new.suspended_at is distinct from old.suspended_at
    or new.suspended_by is distinct from old.suspended_by
    or new.listing_limit_override is distinct from old.listing_limit_override
    or new.completed_sales_count is distinct from old.completed_sales_count
    or new.rating_average is distinct from old.rating_average
    or new.rating_count is distinct from old.rating_count
    or new.dispute_upheld_count is distinct from old.dispute_upheld_count
  ) then
    raise exception
      'is_admin, is_suspended, suspension_reason, suspended_at, suspended_by, listing_limit_override, and every denormalised trust counter are admin/trigger-only fields and cannot be changed by the profile owner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger prevent_profile_self_service_admin_fields
  before update on public.profiles
  for each row
  execute function public.prevent_profile_self_service_admin_fields();

-- Same shape for listings.status <-> 'suspended' and the three suspension
-- audit columns: a seller's own listings_update_own UPDATE (used by
-- updateListing/removeListing) must never be able to suspend or, more
-- importantly, un-suspend her own listing — that would make
-- suspendListing trivially reversible client-side, defeating the entire
-- feature this migration builds.
create function public.prevent_listing_self_service_suspension()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and (
    new.suspension_reason is distinct from old.suspension_reason
    or new.suspended_at is distinct from old.suspended_at
    or new.suspended_by is distinct from old.suspended_by
    or (new.status is distinct from old.status and (new.status = 'suspended' or old.status = 'suspended'))
  ) then
    raise exception
      'listing suspension state is admin-only and cannot be changed by the listing owner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger prevent_listing_self_service_suspension
  before update on public.listings
  for each row
  execute function public.prevent_listing_self_service_suspension();

-- =============================================================================
-- order_status_transitions gains 'admin' as a legitimate actor_role — the
-- first admin-driven order transition (resolve_dispute_release/_refund
-- below). Every prior transition function's actor was buyer, seller, or
-- system; this is a real new case, not an oversight to backfill.
-- =============================================================================
alter table public.order_status_transitions drop constraint order_status_transitions_actor_role_enum;
alter table public.order_status_transitions add constraint order_status_transitions_actor_role_enum
  check (actor_role in ('buyer', 'seller', 'system', 'admin'));

-- =============================================================================
-- admin_suspend_listing(): §10 Epic E1 AC2/AC3/AC4/AC5 in one atomic call —
-- sets the listing suspended with its reason (AC3), works whether or not
-- the listing was ever flagged (AC4: "admin may suspend any listing
-- directly"), and closes out every OPEN moderation_flags row for that
-- listing with reviewed_by/reviewed_at (AC5) in the same transaction, so a
-- suspend from the queue can never leave a stale open flag behind. No
-- prior-status restriction (matching Decision #38's reasoning for
-- removeListing — AC4 doesn't ask for one, adding one would be an
-- unrequested restriction).
-- =============================================================================
create or replace function public.admin_suspend_listing(
  p_listing_id uuid,
  p_admin_id uuid,
  p_reason text
)
returns setof public.listings
language plpgsql
as $$
begin
  update public.listings
  set status = 'suspended',
      suspension_reason = p_reason,
      suspended_at = now(),
      suspended_by = p_admin_id
  where id = p_listing_id;

  if not found then
    return;
  end if;

  update public.moderation_flags
  set status = 'actioned',
      reviewed_by = p_admin_id,
      reviewed_at = now()
  where listing_id = p_listing_id and status = 'open';

  return query select * from public.listings where id = p_listing_id;
end;
$$;

revoke execute on function public.admin_suspend_listing(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_suspend_listing(uuid, uuid, text) to service_role;

-- =============================================================================
-- resolve_dispute_release() / resolve_dispute_refund(): §10 Epic E2
-- AC2/AC3/AC4. Same atomic-transition shape as release_order (Prompt 16) —
-- WHERE status = 'disputed' is the actual guard, an order_status_transitions
-- row is written in the same transaction, EXECUTE revoked from every role
-- but service_role.
--
-- The release path duplicates release_order()'s payout-creation block
-- rather than calling it, because release_order()'s own WHERE clause
-- requires status = 'delivered' (Decision #61's confirmed state model) —
-- a disputed order is never delivered again, it goes disputed -> released
-- directly per §8.1's diagram, so release_order() itself cannot be reused
-- unchanged. Kept as two separate functions rather than one parameterised
-- one so each has a single, obviously-correct WHERE clause matching its own
-- edge of the state diagram, same reasoning as expire_pending_order and
-- auto_advance_shipped_to_delivered staying separate from release_order.
--
-- The refund path creates no payout row at all (AC3: "creates no payout") —
-- structurally true with zero extra code, since disputed orders provably
-- never held a payout row to begin with (raise_dispute's own comment:
-- release_order only ever fires on status='delivered', mutually exclusive
-- with a dispute already being open).
-- =============================================================================
create or replace function public.resolve_dispute_release(
  p_dispute_id uuid,
  p_admin_id uuid,
  p_notes text
)
returns setof public.orders
language plpgsql
as $$
declare
  v_order_id uuid;
  v_seller_id uuid;
  v_seller_payout_kobo integer;
  v_account_id uuid;
  v_account_verified boolean;
begin
  update public.disputes
  set status = 'resolved_seller',
      admin_notes = p_notes,
      resolved_by = p_admin_id,
      resolved_at = now()
  where id = p_dispute_id and status = 'open'
  returning order_id into v_order_id;

  if v_order_id is null then
    return;
  end if;

  update public.orders
  set status = 'released',
      released_at = now()
  where id = v_order_id and status = 'disputed'
  returning seller_id, seller_payout_kobo into v_seller_id, v_seller_payout_kobo;

  if v_seller_id is null then
    -- Dispute row updated but the order wasn't in the expected state —
    -- roll back the whole call so an admin never sees "resolved" without
    -- the matching order transition.
    raise exception 'resolve_dispute_release: order % is not disputed', v_order_id;
  end if;

  insert into public.order_status_transitions (order_id, from_status, to_status, actor_role, actor_id, note)
  values (v_order_id, 'disputed', 'released', 'admin', p_admin_id, 'Dispute resolved for the seller: ' || p_notes);

  -- Same payout-creation logic as release_order() (Prompt 16) — resolves
  -- the seller's most recently created verified payout_accounts row,
  -- is_blocked when none exists or none is verified.
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
    v_seller_payout_kobo,
    v_account_id is null or not coalesce(v_account_verified, false)
  );

  return query select * from public.orders where id = v_order_id;
end;
$$;

revoke execute on function public.resolve_dispute_release(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_dispute_release(uuid, uuid, text) to service_role;

-- Called only after the Paystack refund API call has already succeeded
-- (src/lib/actions/admin.ts) — never flips DB state to "refunded" on the
-- strength of the admin's click alone, only once the refund request has
-- actually been accepted by Paystack. See that file for the full ordering
-- rationale.
create or replace function public.resolve_dispute_refund(
  p_dispute_id uuid,
  p_admin_id uuid,
  p_notes text
)
returns setof public.orders
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  update public.disputes
  set status = 'resolved_buyer',
      admin_notes = p_notes,
      resolved_by = p_admin_id,
      resolved_at = now()
  where id = p_dispute_id and status = 'open'
  returning order_id into v_order_id;

  if v_order_id is null then
    return;
  end if;

  update public.orders
  set status = 'refunded',
      refunded_at = now()
  where id = v_order_id and status = 'disputed';

  if not found then
    raise exception 'resolve_dispute_refund: order % is not disputed', v_order_id;
  end if;

  insert into public.order_status_transitions (order_id, from_status, to_status, actor_role, actor_id, note)
  values (v_order_id, 'disputed', 'refunded', 'admin', p_admin_id, 'Dispute resolved for the buyer: ' || p_notes);

  return query select * from public.orders where id = v_order_id;
end;
$$;

revoke execute on function public.resolve_dispute_refund(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_dispute_refund(uuid, uuid, text) to service_role;
