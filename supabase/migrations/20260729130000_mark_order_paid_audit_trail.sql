-- Retrofits mark_order_paid (Prompt 14, 20260729100000_mark_order_paid_function.sql)
-- to also write an order_status_transitions row. That table didn't exist
-- when Prompt 14 shipped, so the pending -> paid transition — the very
-- first one in the order lifecycle — was the one gap left in the audit
-- trail this prompt otherwise makes complete. Prompt 15's own instructions
-- are explicit and repeated ("every state transition is recorded... no
-- exceptions", "a transition without an audit record is a bug"); leaving
-- the very first transition unrecorded, purely because the table postdates
-- the code that performs it, would be exactly the kind of exception that
-- HARD RULE is written to prevent. `paid_at` + `webhook_events.payload`
-- already gave this transition SOME audit record (Decision #59) — this
-- adds it to the same table every other transition now uses, for
-- consistency, not because the old mechanism was wrong.
--
-- Never edit an already-applied migration file (20260729100000...) — this
-- is a new migration that CREATE OR REPLACEs the same function, same
-- discipline as every other in-place function update in this schema.
-- REVOKE/GRANT unchanged (service_role only); re-stated for completeness
-- since CREATE OR REPLACE does not touch existing grants, but explicit
-- beats implicit for a security-relevant boundary like this one.
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

  insert into public.order_status_transitions (order_id, from_status, to_status, actor_role, actor_id, note)
  values (p_order_id, 'pending', 'paid', 'system', null, 'Paystack webhook confirmed payment');

  return query select * from public.orders where id = p_order_id;
end;
$$;

revoke execute on function public.mark_order_paid(uuid) from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid) to service_role;
