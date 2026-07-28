-- PRD §7.1 (profiles denormalised columns, "maintained by trigger" notes),
-- §5.4 (completed_sales_count), §9.2 (rating_average / dispute rules).
--
-- Scope note: this migration does NOT touch listings.seller_listing_index.
-- That trigger (assign_seller_listing_index) already exists, built in
-- Prompt 4's migration (20260727215742_categories_listings.sql) — advisory-
-- lock-serialised, fires at publish time, non-racy. Building a second
-- trigger on the same column here would fire alongside it on every
-- insert/update, which is pure duplication, not a fix. Per your decision,
-- skipped. See docs/DECISIONS.md.
--
-- Also: the PRD uses `seller_listing_index` for both the listings column
-- (§7.1) and the listing_published event property (§3.5) — there is no
-- "seller_listing_ordinal" anywhere in the PRD. Naming stays unified.

-- =============================================================================
-- profiles.completed_sales_count — orders reaching `released`
-- =============================================================================

-- HARD RULE (§5.4/§7.1): maintained ONLY by trigger on transition to
-- `released`, never by aggregating orders at read or publish time.
-- No SECURITY DEFINER needed: `orders` has no UPDATE policy for
-- `authenticated` at all (Prompt 5's migration) — the only way this
-- trigger can fire is a service-role transition, which already bypasses
-- RLS for the whole transaction, including this trigger's own UPDATE.
create function public.increment_completed_sales_count()
returns trigger
language plpgsql
as $$
begin
  update public.profiles
    set completed_sales_count = completed_sales_count + 1
    where id = new.seller_id;
  return new;
end;
$$;

create trigger increment_completed_sales_count
  after update on public.orders
  for each row
  when (new.status = 'released' and old.status is distinct from 'released')
  execute function public.increment_completed_sales_count();

-- =============================================================================
-- profiles.rating_average / rating_count — ratings insert
-- =============================================================================

-- PRD §9.2 HARD RULE: rating_average is hidden (NULL) below 3 ratings.
-- Full recompute over the seller's ratings on every insert, not an
-- incremental running average — insert volume per seller is low, and a
-- recompute can't drift the way an incremental update could.
--
-- SECURITY DEFINER is required here, unlike the two triggers above:
-- ratings are inserted by the buyer's own authenticated session
-- (ratings_insert_buyer_on_concluded_order, Prompt 5), not the service
-- role, but this trigger must update the SELLER's profiles row — a
-- different row than the inserting user's own. Without SECURITY DEFINER,
-- profiles_update_own's `auth.uid() = id` check would silently block the
-- update (0 rows affected, no error) because the buyer isn't the seller.
create function public.recompute_seller_rating()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_average numeric(2, 1);
begin
  -- Serializes concurrent rating inserts for the same seller so the
  -- aggregate below always reflects every committed rating, never a
  -- stale snapshot read before a concurrent insert for the same seller
  -- committed. Same advisory-lock pattern as assign_seller_listing_index
  -- (20260727215742_categories_listings.sql).
  perform pg_advisory_xact_lock(hashtext(new.seller_id::text)::bigint);

  -- Every rating counts toward the average regardless of is_hidden —
  -- is_hidden only hides the review text (PRD §7.1: "hides the review
  -- text but the score still counts").
  select count(*), avg(score)::numeric(2, 1)
    into v_count, v_average
    from public.ratings
    where seller_id = new.seller_id;

  update public.profiles
    set rating_count = v_count,
        rating_average = case when v_count >= 3 then v_average else null end
    where id = new.seller_id;

  return new;
end;
$$;

create trigger recompute_seller_rating
  after insert on public.ratings
  for each row
  execute function public.recompute_seller_rating();

-- =============================================================================
-- profiles.dispute_upheld_count — dispute resolved against the seller
-- =============================================================================

-- PRD §8.1: disputed --resolved_buyer--> refunded is the path where the
-- dispute is upheld against the seller (resolved_seller means the seller
-- was in the right; no count). disputes has no seller_id column of its own
-- (Prompt 5, per PRD §7.1 exactly) — the seller is looked up via order_id.
-- No SECURITY DEFINER needed: same reasoning as completed_sales_count —
-- `disputes` has no UPDATE policy for `authenticated` (Prompt 5), so
-- resolution can only happen via the service role, which already bypasses
-- RLS for this trigger's UPDATE too.
create function public.increment_dispute_upheld_count()
returns trigger
language plpgsql
as $$
begin
  update public.profiles
    set dispute_upheld_count = dispute_upheld_count + 1
    where id = (select seller_id from public.orders where id = new.order_id);
  return new;
end;
$$;

create trigger increment_dispute_upheld_count
  after update on public.disputes
  for each row
  when (new.status = 'resolved_buyer' and old.status is distinct from 'resolved_buyer')
  execute function public.increment_dispute_upheld_count();
