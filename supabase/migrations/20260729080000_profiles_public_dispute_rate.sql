-- PRD §10 Epic C3 AC5 / §9.2 Job 3: the seller reputation block needs
-- dispute rate (dispute_upheld_count / completed_sales_count, shown only
-- once completed_sales_count >= 5). profiles_public (docs/DECISIONS.md #1)
-- deliberately excluded dispute_upheld_count pending the epic that would
-- actually need it publicly — Decision #1's own "Revisit" note names this
-- exact moment. Same gating pattern as rating_count/rating_average: the raw
-- count is exposed, the >=5 threshold is applied by the caller, not the view.

create or replace view public.profiles_public
  with (security_invoker = false)
  as
  select
    id,
    display_name,
    handle,
    avatar_url,
    bio,
    state,
    completed_sales_count,
    rating_average,
    rating_count,
    created_at,
    dispute_upheld_count
  from public.profiles
  where is_suspended = false;

grant select on public.profiles_public to anon, authenticated;
