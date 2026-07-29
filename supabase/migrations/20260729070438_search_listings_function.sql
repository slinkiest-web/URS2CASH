-- PRD §10 Epic C2 (Search). HARD RULE: "search is never gated by browsable."
-- AC1: "Search returns published listings across all listable categories
-- regardless of browsable. AC1 fails if any browsable check exists in the
-- search path." This function contains no reference to `browsable` at all —
-- by construction, not by omission.
--
-- AC2: "Full text search over title and description using the tsvector
-- index." §7.1's index is a two-column expression
-- (`to_tsvector('english', title || ' ' || description)`), not a stored
-- column — supabase-js's `.textSearch()` builder needs a single tsvector
-- column to target, which doesn't exist here. Rather than add a generated
-- column the PRD's data model doesn't define (and re-point the existing,
-- already-specified index at it), this thin SQL wrapper uses the exact
-- index expression from §7.1 as written.
--
-- Not SECURITY DEFINER: runs as the calling role (anon or authenticated), so
-- `listings_select_published`'s RLS policy applies exactly as it would to a
-- direct SELECT — this is a read convenience, not a privilege escalation.
-- No explicit GRANT EXECUTE is needed: PUBLIC already has EXECUTE on every
-- function in this schema by Postgres's own built-in default for functions
-- (unlike tables, which default to no access — confirmed empirically
-- against every other function already in this schema before writing this
-- migration).
create or replace function public.search_listings(
  search_query text,
  result_limit integer default 24,
  result_offset integer default 0
)
returns setof public.listings
language sql
stable
as $$
  select *
  from public.listings
  where status = 'published'
    and to_tsvector('english', title || ' ' || description)
        @@ websearch_to_tsquery('english', search_query)
  order by published_at desc
  limit result_limit
  offset result_offset;
$$;
