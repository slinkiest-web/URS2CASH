-- PRD §10 Epic D1 AC8/AC9 (discovered while building checkout, not asked
-- for by the task item list — see docs/DECISIONS.md #54):
--
-- AC8: "A listing already having a non `cancelled`, non `expired` order
-- cannot enter checkout. The UNIQUE constraint on `orders.listing_id` is
-- the enforcement, and the race is handled by catching the constraint
-- violation, not by a pre check."
-- AC9: "A `pending` order older than 30 minutes is set to `expired` by a
-- scheduled job, freeing the listing."
--
-- The blanket `unique` constraint on `orders.listing_id`, as built literally
-- from §7.1's table in 20260728100239_orders_and_related.sql, cannot express
-- this: once any order row exists for a listing, no second row could ever be
-- inserted for that listing_id again — not even after the first resolves to
-- `cancelled` or `expired` — which would permanently block every future
-- purchase attempt on that listing after a single expired checkout. AC8's
-- own wording ("non cancelled, non expired") only makes sense against a
-- uniqueness rule scoped to active orders, and AC9's "freeing the listing"
-- requires exactly that: a new order becomes insertable again once the
-- blocking one resolves. A partial unique index is the standard Postgres
-- mechanism for "unique among rows matching a condition."

alter table public.orders drop constraint orders_listing_id_key;

create unique index orders_listing_id_active_unique
  on public.orders (listing_id)
  where status not in ('cancelled', 'expired');

comment on index public.orders_listing_id_active_unique is
  'PRD §10 Epic D1 AC8/AC9. Replaces the blanket UNIQUE on listing_id — active-only, so a listing frees up for a new order once its blocking one is cancelled or expired. initiateCheckout relies on this index''s violation (Postgres error 23505), not a pre-check, to handle the concurrent-checkout race.';
