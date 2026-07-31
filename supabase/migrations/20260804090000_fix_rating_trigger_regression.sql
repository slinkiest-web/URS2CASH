-- PRD §13 Definition of Done — the final verification pass. Fixes a real
-- regression this pass found, not a new feature.
--
-- =============================================================================
-- Bug: `prevent_profile_self_service_admin_fields()` (Prompt 19,
-- 20260801100000_admin_role_and_moderation.sql) blocks any `profiles`
-- UPDATE where `auth.uid() is not null`, reasoning that a real user JWT on
-- the connection means "the profile owner's own session," and the service
-- role (every admin action) has no JWT and is therefore exempt. That
-- reasoning silently broke `recompute_seller_rating` (Prompt 6): ratings
-- are inserted through the BUYER's own authenticated session client, not
-- service-role, by deliberate design (Decision #76 — RLS is the real gate
-- on `ratings`, not a service-role hop). `recompute_seller_rating` is
-- `SECURITY DEFINER` so it can UPDATE the seller's `profiles` row despite
-- running inside the buyer's own transaction — but `SECURITY DEFINER` only
-- elevates table-level privilege checks, it does NOT change `auth.uid()`,
-- which reads a connection-level GUC unaffected by privilege elevation.
-- So the cascading UPDATE to `rating_average`/`rating_count` still runs
-- with `auth.uid()` equal to the buyer's own id (non-null) and got blocked
-- by the exact trigger meant to stop self-service tampering — silently
-- breaking every real rating submission's trigger-computed average since
-- Prompt 19 shipped. Caught live by this prompt's own verification (a real
-- buyer-session rating insert failing with the lockdown trigger's error),
-- not by inspection.
--
-- Fix: `pg_trigger_depth()` distinguishes a direct top-level UPDATE
-- (depth = 1, just this trigger executing) from an UPDATE cascading out of
-- another trigger's own execution (depth >= 2 — `recompute_seller_rating`'s
-- AFTER INSERT trigger is already one level deep when its UPDATE fires this
-- BEFORE UPDATE trigger as a nested call). No client role can fake this —
-- `authenticated`/`anon` cannot create triggers on `profiles` at all, only
-- the triggers this schema itself defines exist, so depth is not a
-- gameable signal. Re-audited every other denormalised-counter trigger for
-- the same class of bug: `increment_completed_sales_count` and
-- `increment_dispute_upheld_count` both fire from `orders`/`disputes`
-- UPDATEs, and neither table has ANY authenticated UPDATE policy at all
-- (every transition goes through a service-role-only RPC) — so those two
-- were never reachable with a non-null `auth.uid()` to begin with, and
-- need no change. `prevent_listing_self_service_suspension` (the sibling
-- trigger on `listings`) has no analogous cascade either — nothing outside
-- the service-role-only order/payout RPCs ever writes `listings` as a side
-- effect of a user-session action. `recompute_seller_rating` is the one
-- and only case, because `ratings` is the one and only table in this
-- schema with a direct (non-service-role) authenticated write path that
-- cascades into another table's admin-protected columns.
-- =============================================================================
create or replace function public.prevent_profile_self_service_admin_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and pg_trigger_depth() <= 1 and (
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
