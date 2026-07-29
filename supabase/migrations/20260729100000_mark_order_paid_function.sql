-- PRD §8.1 HARD RULE: "paid is entered by the Paystack webhook and by
-- nothing else." §8.1 HARD RULE: "the transition to paid sets
-- listings.status = 'sold' in the same database transaction. If the
-- transaction fails, neither happens." §10 Epic D2 AC3: "On charge.success,
-- in one transaction: order to paid, paid_at set, listing to sold. Failure
-- rolls back both."
--
-- supabase-js has no way to run an arbitrary multi-table transaction across
-- separate `.from()` calls — a single Postgres function invocation is the
-- standard way to get real atomicity here (same reasoning as
-- search_listings, Prompt 10, though for a very different purpose). Not
-- SECURITY DEFINER: the only intended caller is the webhook route handler
-- using the service-role client, which already has full table access and
-- bypasses RLS on its own — no privilege elevation is needed inside the
-- function itself.
--
-- HARD RULE, and this is the actual security boundary: this function must
-- be callable ONLY by service_role. Every function in this schema is
-- PUBLIC-executable by Postgres's own default unless explicitly revoked
-- (confirmed empirically when search_listings was built, Prompt 10) —
-- unlike search_listings, which is safe to leave at that default because it
-- only ever reads through RLS, this function performs privileged writes
-- that RLS does not gate for `authenticated`/`anon` at all. If any
-- authenticated client could call this RPC directly, "the webhook is the
-- ONLY writer of paid" (§8.1) would be trivially false. The explicit
-- REVOKE/GRANT below is not optional.
--
-- Conditioned on `status = 'pending'` so a second, differently-event-id'd
-- call (a defensive secondary safety net, never the primary idempotency
-- mechanism — that's `webhook_events`' UNIQUE (provider, event_id), per
-- §10 Epic D2 AC2) is a safe no-op: zero rows returned, caller does not
-- re-fire side effects.
create or replace function public.mark_order_paid(p_order_id uuid)
returns setof public.orders
language plpgsql
as $$
declare
  v_listing_id uuid;
begin
  update public.orders
  set status = 'paid', paid_at = now()
  where id = p_order_id and status = 'pending'
  returning listing_id into v_listing_id;

  if v_listing_id is null then
    return;
  end if;

  update public.listings
  set status = 'sold'
  where id = v_listing_id;

  return query select * from public.orders where id = p_order_id;
end;
$$;

revoke execute on function public.mark_order_paid(uuid) from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid) to service_role;

comment on function public.mark_order_paid(uuid) is
  'PRD §8.1/§10 Epic D2 AC3. The only function that may transition an order to paid — callable only by service_role (see the migration comment above for why the REVOKE is load-bearing, not decorative). Called exclusively from /api/webhooks/paystack.';
