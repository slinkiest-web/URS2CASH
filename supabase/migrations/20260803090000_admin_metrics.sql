-- PRD §10 Epic E4 (category flags), §6.2 (visibility flags, the browsable
-- gate), §3 (MVP success framework — §3.1 primary metric, §3.2 supporting
-- metrics, §3.4/§3.4.1 kill/expand + diagnostic framework), §3.5 (event
-- schema — "derived, not emitted"). Prompt 21.
--
-- Note on citation drift in this prompt's own task brief, resolved before
-- writing any code (same posture as every prior prompt's citation-drift
-- decisions): the brief cites "section 2" for the success framework and
-- "2.5"/"2.6" for events/the browsable threshold. The actual PRD structure
-- is: §2 is "The core question this MVP exists to answer" (no metrics in
-- it at all); §3 is "MVP success framework" (§3.1 primary metric, §3.2
-- supporting metrics, §3.4 kill/expand — the real browsable-gate numbers
-- live here: "30 or more active published listings from 10 or more
-- distinct sellers, and... conversion... at or above 15%" — not "2.6"),
-- §3.5 is the event schema (not "2.5"). Independent listable/browsable
-- flags are §6.2, not "section 4" (§4 is "Users and roles" — it only
-- mentions that Admin "controls category flags", nothing about the flags
-- themselves). "US-13"/"US-14" don't exist anywhere in the PRD — grepped;
-- the real acceptance criteria are §10 Epic E4 (category control). The
-- brief's "buyer repeat rate within 60 days" also contradicts §3.2's own
-- literal text ("Buyer repeat rate (30 day)") — built against the PRD's
-- 30-day window, not the brief's 60.
--
-- Every metric below is computed directly from `listings`/`orders`/
-- `disputes`/`moderation_flags` timestamps, not from any event stream —
-- `track()` (src/lib/analytics/events.ts) is still a console.log stub as
-- of this prompt (Prompt 22 is explicitly where "the analytics event layer
-- used as stubs throughout" gets consolidated, per this prompt's own
-- context handoff), so there is no queryable PostHog data to compute
-- against yet. §3.5's own "derived, not emitted" note already establishes
-- that second-listing-rate/cohort-retention/time-to-second-listing are
-- meant to be computed from `listing_published`'s underlying facts
-- (`seller_listing_index`, timestamps) rather than from a dedicated event
-- — this migration extends that same "compute from persisted state"
-- posture to every other §3.2 metric too, out of necessity, not choice.

-- =============================================================================
-- metric_second_listing_rate(): §3.1, the primary metric. "Of all sellers
-- who publish a first listing in a given week, the percentage who publish
-- a second listing within 30 days of the first." Aggregated across every
-- cohort to date (not one week) for a single live figure — only cohorts
-- whose first listing is already >=30 days old are included, so a seller
-- who simply hasn't had her full 30-day window yet is never counted as a
-- "miss."
-- =============================================================================
create or replace function public.metric_second_listing_rate()
returns table (cohort_seller_count bigint, second_listing_count bigint, rate_percent numeric)
language sql
stable
as $$
  with first_listings as (
    select seller_id, published_at
    from public.listings
    where seller_listing_index = 1
      and published_at is not null
      and published_at <= now() - interval '30 days'
  ),
  seconds as (
    select seller_id, published_at
    from public.listings
    where seller_listing_index = 2
      and published_at is not null
  )
  select
    count(distinct f.seller_id),
    count(distinct s.seller_id),
    case when count(distinct f.seller_id) = 0 then null
      else round(100.0 * count(distinct s.seller_id) / count(distinct f.seller_id), 1)
    end
  from first_listings f
  left join seconds s on s.seller_id = f.seller_id and s.published_at <= f.published_at + interval '30 days';
$$;

revoke execute on function public.metric_second_listing_rate() from public, anon, authenticated;
grant execute on function public.metric_second_listing_rate() to service_role;

-- =============================================================================
-- metric_median_time_to_second_listing(): §3.2. The observed distribution
-- among sellers who DID reach a second listing — not capped at 30 days
-- (that cap belongs to §3.1's rate, not this metric's own definition,
-- which is "read alongside 3.1, never alone" precisely because it can show
-- a wider or narrower picture).
-- =============================================================================
create or replace function public.metric_median_time_to_second_listing()
returns numeric
language sql
stable
as $$
  select round(
    (percentile_cont(0.5) within group (
      order by extract(epoch from (s.published_at - f.published_at)) / 86400.0
    ))::numeric,
    1
  )
  from public.listings f
  join public.listings s on s.seller_id = f.seller_id and s.seller_listing_index = 2
  where f.seller_listing_index = 1 and f.published_at is not null and s.published_at is not null;
$$;

revoke execute on function public.metric_median_time_to_second_listing() from public, anon, authenticated;
grant execute on function public.metric_median_time_to_second_listing() to service_role;

-- =============================================================================
-- metric_listing_to_sale_conversion_by_category(): §3.2's literal
-- definition — "listings published in a cohort that reach `released`
-- status within 30 days" — grouped by category. Shared by both the
-- category-flags screen (§6.2's "live listing count and seller count next
-- to each flag", extended with this conversion figure per this prompt's
-- own brief) and the metrics dashboard, one definition, one place. Scoped
-- to listings published >=30 days ago, same unbiased-cohort reasoning as
-- the primary metric above. A listing can in principle carry more than one
-- order over its life (Decision #54) — `distinct` on the converted CTE
-- means a listing counts as converted at most once regardless.
-- =============================================================================
create or replace function public.metric_listing_to_sale_conversion_by_category()
returns table (category_slug text, category_name text, published_count bigint, converted_count bigint, conversion_rate_percent numeric)
language sql
stable
as $$
  with eligible as (
    select id, category_id, published_at
    from public.listings
    where published_at is not null
      and published_at <= now() - interval '30 days'
  ),
  converted as (
    select distinct o.listing_id
    from public.orders o
    join eligible el on el.id = o.listing_id
    where o.status = 'released'
      and o.released_at is not null
      and o.released_at <= el.published_at + interval '30 days'
  )
  select
    c.slug,
    c.name,
    count(el.id),
    count(el.id) filter (where cv.listing_id is not null),
    case when count(el.id) = 0 then null
      else round(100.0 * count(el.id) filter (where cv.listing_id is not null) / count(el.id), 1)
    end
  from public.categories c
  left join eligible el on el.category_id = c.id
  left join converted cv on cv.listing_id = el.id
  group by c.id, c.slug, c.name
  order by c.sort_order;
$$;

revoke execute on function public.metric_listing_to_sale_conversion_by_category() from public, anon, authenticated;
grant execute on function public.metric_listing_to_sale_conversion_by_category() to service_role;

-- =============================================================================
-- metric_median_time_to_first_sale_by_category(): §3.2 — "The seller's
-- lived experience... leading indicator for 3.1." Read as: from a seller's
-- very first listing to the first time ANY of her listings sells,
-- attributed to the category of that first listing (her entry point into
-- the platform) — not a per-listing figure, a per-seller one.
-- =============================================================================
create or replace function public.metric_median_time_to_first_sale_by_category()
returns table (category_slug text, category_name text, median_days numeric)
language sql
stable
as $$
  with first_listing as (
    select distinct on (seller_id) seller_id, category_id, published_at
    from public.listings
    where seller_listing_index = 1 and published_at is not null
    order by seller_id, published_at
  ),
  first_sale as (
    select fl.seller_id, fl.category_id, fl.published_at, min(o.released_at) as first_released_at
    from first_listing fl
    join public.orders o on o.seller_id = fl.seller_id and o.status = 'released' and o.released_at is not null
    group by fl.seller_id, fl.category_id, fl.published_at
  )
  select
    c.slug,
    c.name,
    round(
      (percentile_cont(0.5) within group (
        order by extract(epoch from (fs.first_released_at - fs.published_at)) / 86400.0
      ))::numeric,
      1
    )
  from first_sale fs
  join public.categories c on c.id = fs.category_id
  group by c.id, c.slug, c.name
  order by c.sort_order;
$$;

revoke execute on function public.metric_median_time_to_first_sale_by_category() from public, anon, authenticated;
grant execute on function public.metric_median_time_to_first_sale_by_category() to service_role;

-- =============================================================================
-- metric_weekly_seller_cohort_retention(): §3.2 — "Weekly cohorts, tracked
-- by listing activity... weeks 1 through 8." Cohort = the ISO week of a
-- seller's first-ever listing. For each cohort and each week-offset 1-8,
-- retention = the % of that cohort who published ANY listing (not
-- necessarily their Nth) during that specific offset week.
-- =============================================================================
create or replace function public.metric_weekly_seller_cohort_retention()
returns table (cohort_week date, week_offset int, cohort_size bigint, active_count bigint, retention_rate_percent numeric, window_end date)
language sql
stable
as $$
  with first_listing as (
    select distinct on (seller_id) seller_id, date_trunc('week', published_at)::date as cohort_week
    from public.listings
    where seller_listing_index = 1 and published_at is not null
    order by seller_id, published_at
  ),
  cohort_sizes as (
    select cohort_week, count(*) as cohort_size
    from first_listing
    group by cohort_week
  ),
  activity as (
    select distinct seller_id, date_trunc('week', published_at)::date as activity_week
    from public.listings
    where published_at is not null
  ),
  grid as (
    select cs.cohort_week, o.week_offset, cs.cohort_size
    from cohort_sizes cs
    cross join generate_series(1, 8) as o(week_offset)
  )
  select
    g.cohort_week,
    g.week_offset,
    g.cohort_size,
    count(distinct fl.seller_id) filter (
      where exists (
        select 1 from activity a
        where a.seller_id = fl.seller_id
          and a.activity_week = g.cohort_week + (g.week_offset * 7)
      )
    ),
    round(
      100.0 * count(distinct fl.seller_id) filter (
        where exists (
          select 1 from activity a
          where a.seller_id = fl.seller_id
            and a.activity_week = g.cohort_week + (g.week_offset * 7)
        )
      ) / nullif(g.cohort_size, 0),
      1
    ),
    g.cohort_week + (g.week_offset * 7) + 6
  from grid g
  join first_listing fl on fl.cohort_week = g.cohort_week
  group by g.cohort_week, g.week_offset, g.cohort_size
  order by g.cohort_week, g.week_offset;
$$;

revoke execute on function public.metric_weekly_seller_cohort_retention() from public, anon, authenticated;
grant execute on function public.metric_weekly_seller_cohort_retention() to service_role;

-- =============================================================================
-- metric_buyer_repeat_rate_30d(): §3.2 — "demand side equivalent of 3.1."
-- "Completed order" read as `released` (the successful-conclusion status —
-- a `refunded` order is not the success case this metric is measuring
-- repeat behaviour from). Same unbiased-cohort treatment: only buyers
-- whose first completed order is already >=30 days old are counted.
-- =============================================================================
create or replace function public.metric_buyer_repeat_rate_30d()
returns table (buyer_count bigint, repeat_count bigint, rate_percent numeric)
language sql
stable
as $$
  with first_order as (
    select distinct on (buyer_id) buyer_id, released_at
    from public.orders
    where status = 'released'
      and released_at is not null
      and released_at <= now() - interval '30 days'
    order by buyer_id, released_at
  ),
  repeats as (
    select distinct fo.buyer_id
    from first_order fo
    join public.orders o2
      on o2.buyer_id = fo.buyer_id
      and o2.status = 'released'
      and o2.released_at is not null
      and o2.released_at > fo.released_at
      and o2.released_at <= fo.released_at + interval '30 days'
  )
  select
    count(*),
    (select count(*) from repeats),
    case when count(*) = 0 then null
      else round(100.0 * (select count(*) from repeats) / count(*), 1)
    end
  from first_order;
$$;

revoke execute on function public.metric_buyer_repeat_rate_30d() from public, anon, authenticated;
grant execute on function public.metric_buyer_repeat_rate_30d() to service_role;

-- =============================================================================
-- metric_dispute_rate(): §3.2 — "Disputed orders as a percentage of paid
-- orders." "Disputed" read as "ever had a dispute raised" (any row in
-- `disputes`, regardless of how it was later resolved) — the trust-health
-- question is how often a dispute happened at all, not how many are
-- currently still open.
-- =============================================================================
create or replace function public.metric_dispute_rate()
returns table (paid_order_count bigint, disputed_order_count bigint, rate_percent numeric)
language sql
stable
as $$
  select
    count(*) filter (where o.paid_at is not null),
    count(*) filter (where o.paid_at is not null and d.order_id is not null),
    case when count(*) filter (where o.paid_at is not null) = 0 then null
      else round(
        100.0 * count(*) filter (where o.paid_at is not null and d.order_id is not null)
        / count(*) filter (where o.paid_at is not null),
        1
      )
    end
  from public.orders o
  left join public.disputes d on d.order_id = o.id;
$$;

revoke execute on function public.metric_dispute_rate() from public, anon, authenticated;
grant execute on function public.metric_dispute_rate() to service_role;

-- =============================================================================
-- metric_leakage_signal_rate(): §3.2 defines the raw count ("Off platform
-- leakage signals (count)... contact detail detector at submission, plus
-- admin flagged leakage cases"); §3.3 Assumption 9's falsifier expresses it
-- as a percentage ("`contact_detail_flagged` exceeding 15% of published
-- listings") — this function returns both. Scoped to `source =
-- 'auto_contact_detect'` specifically: `moderation_flags.source = 'admin'`
-- is a generic bucket covering every admin-initiated flag (skin-lightening,
-- counterfeit, repeat-violation, etc, per Decision from Prompt 19's
-- SUSPEND_LISTING_REASONS), with no column distinguishing "this admin flag
-- was specifically about off-platform leakage" from any other reason — a
-- real, flagged limitation (Known Issues), not silently over-counted.
-- =============================================================================
create or replace function public.metric_leakage_signal_rate()
returns table (published_listing_count bigint, leakage_flag_count bigint, rate_percent numeric)
language sql
stable
as $$
  select
    (select count(*) from public.listings where published_at is not null),
    (select count(distinct listing_id) from public.moderation_flags where source = 'auto_contact_detect'),
    case when (select count(*) from public.listings where published_at is not null) = 0 then null
      else round(
        100.0 * (select count(distinct listing_id) from public.moderation_flags where source = 'auto_contact_detect')
        / (select count(*) from public.listings where published_at is not null),
        1
      )
    end;
$$;

revoke execute on function public.metric_leakage_signal_rate() from public, anon, authenticated;
grant execute on function public.metric_leakage_signal_rate() to service_role;

-- =============================================================================
-- metric_listing_abandonment_rate(): §3.4.1 references reading
-- `listing_draft_started` against `listing_published` for abandonment —
-- neither is queryable (the event layer is still a console.log stub,
-- per this migration's header comment). The DB-derivable proxy: of every
-- `listings` row ever created (draft or published), what fraction is
-- currently stuck at `status = 'draft'` (opened, saved at least once, but
-- never published). This understates true abandonment (a visitor who
-- opened the form and left before the first autosave leaves no DB row at
-- all) — documented as a proxy, not the literal event ratio, in
-- docs/DECISIONS.md and the dashboard UI copy itself.
-- =============================================================================
create or replace function public.metric_listing_abandonment_rate()
returns table (total_listing_count bigint, stuck_draft_count bigint, rate_percent numeric)
language sql
stable
as $$
  select
    count(*),
    count(*) filter (where status = 'draft'),
    case when count(*) = 0 then null
      else round(100.0 * count(*) filter (where status = 'draft') / count(*), 1)
    end
  from public.listings;
$$;

revoke execute on function public.metric_listing_abandonment_rate() from public, anon, authenticated;
grant execute on function public.metric_listing_abandonment_rate() to service_role;

-- =============================================================================
-- metric_payout_latency_hours(): §3.2's 8th supporting metric — present in
-- the PRD but missing from this prompt's own task brief bullet list
-- (which asks for "listing abandonment rate" instead, itself not one of
-- §3.2's 8 named metrics — see that function's comment above). The HARD
-- RULE "do not invent or omit" cuts against dropping a real PRD metric
-- just because the brief's own paraphrase forgot it — built as a 9th/10th
-- dashboard figure alongside abandonment, not a swap. "Time from order
-- reaching `released` to payout marked paid by admin."
-- =============================================================================
create or replace function public.metric_payout_latency_hours()
returns numeric
language sql
stable
as $$
  select round(
    (percentile_cont(0.5) within group (
      order by extract(epoch from (p.paid_at - o.released_at)) / 3600.0
    ))::numeric,
    1
  )
  from public.payouts p
  join public.orders o on o.id = p.order_id
  where p.status = 'paid' and p.paid_at is not null and o.released_at is not null;
$$;

revoke execute on function public.metric_payout_latency_hours() from public, anon, authenticated;
grant execute on function public.metric_payout_latency_hours() to service_role;
