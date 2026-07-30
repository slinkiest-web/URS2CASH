-- PRD §9.1 HARD RULE: "contact details are released only after a successful
-- purchase... Neither party's details are visible at any earlier state, in
-- any surface, in any API response." Known Issue #14 (flagged since
-- Prompt 5, deferred through Prompts 13/14): `orders_select_participant`
-- (Prompt 5) grants a participant full-row SELECT with no column
-- restriction and no status condition — RLS is row-level only, so it
-- cannot express "hide column X for this row unless status = Y." Same
-- "public-column-privacy pattern" already used twice (profiles_public,
-- ratings_public, Decisions #1/#24): a dedicated view does the column-level
-- work RLS structurally cannot.
--
-- Only the SELLER's view of the buyer's delivery_* columns is gated. The
-- buyer already knows her own delivery details (she typed them at
-- checkout, Prompt 13) — hiding them from herself would protect nothing
-- §9.1 is actually concerned with (buyer-to-seller information asymmetry
-- pre-payment), so a signed-in buyer always sees her own order's delivery
-- fields regardless of status.
--
-- `security_invoker` deliberately omitted (defaults to false, same as
-- profiles_public/ratings_public): the view runs as its owner, bypassing
-- the querying role's own RLS on the base `orders` table entirely — which
-- is exactly why the view re-implements its own participant row filter
-- below (`where auth.uid() = buyer_id or auth.uid() = seller_id`) rather
-- than relying on orders_select_participant to have already narrowed the
-- rows.
create view public.orders_participant_view as
select
  o.id,
  o.listing_id,
  o.buyer_id,
  o.seller_id,
  o.status,
  o.amount_kobo,
  o.commission_kobo,
  o.seller_payout_kobo,
  case
    when o.status = 'pending' and auth.uid() = o.seller_id then null
    else o.delivery_name
  end as delivery_name,
  case
    when o.status = 'pending' and auth.uid() = o.seller_id then null
    else o.delivery_state
  end as delivery_state,
  case
    when o.status = 'pending' and auth.uid() = o.seller_id then null
    else o.delivery_address
  end as delivery_address,
  case
    when o.status = 'pending' and auth.uid() = o.seller_id then null
    else o.delivery_phone
  end as delivery_phone,
  o.tracking_note,
  o.paid_at,
  o.shipped_at,
  o.delivered_at,
  o.released_at,
  o.disputed_at,
  o.refunded_at,
  o.auto_release_at,
  o.created_at
from public.orders o
where auth.uid() = o.buyer_id or auth.uid() = o.seller_id;

comment on view public.orders_participant_view is
  'PRD §9.1 HARD RULE / Known Issue #14. The only correct read path for an order-detail surface: never SELECT the base orders table directly for a seller-facing or ambiguous-viewer read, since delivery_name/state/address/phone are only column-masked here, not in the base table (which still exposes them unconditionally to any participant via orders_select_participant). See docs/DECISIONS.md #62.';

grant select on public.orders_participant_view to authenticated;
