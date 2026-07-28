-- PRD §7.1 categories, §7.1 listings, §7.2 RLS, §6.1/§6.3 attribute + condition rules.
-- HARD RULE (PRD §12.1 / §7.2): RLS ships in the same migration as the table it protects.

-- =============================================================================
-- categories
-- =============================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  listable boolean not null default true,
  browsable boolean not null default false,
  -- Mirrors the registry (src/lib/categories/registry.ts), asserted at
  -- startup per §6.5. Divergence is a build failure — that assertion is not
  -- built in this migration; see docs/KNOWN_ISSUES.md.
  photo_min integer not null,
  allowed_conditions text[] not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.categories is 'PRD §7.1. slug matches the category registry key exactly.';

alter table public.categories enable row level security;

-- §7.2: "Public read. Admin write only." Admin writes go through the
-- service-role client (bypasses RLS) per §11.2 — no explicit admin policy
-- needed, same precedent as profiles/payout_accounts (see docs/DECISIONS.md).
create policy "categories_select_public"
  on public.categories for select
  to anon, authenticated
  using (true);

-- =============================================================================
-- listings
-- =============================================================================

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id),
  category_id uuid not null references public.categories (id),
  title text not null,
  description text not null,
  price_kobo integer not null,
  condition text not null,
  condition_notes text,
  status text not null default 'published',
  attributes jsonb not null default '{}',
  attribute_schema_version integer not null,
  photo_urls text[] not null,
  flaw_photo_indexes integer[] not null default '{}',
  seller_listing_index integer not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_title_length check (char_length(title) between 5 and 90),
  constraint listings_description_length check (char_length(description) between 20 and 1500),
  constraint listings_price_kobo_range check (price_kobo between 50000 and 500000000),
  -- §6.3 HARD RULE: condition is a fixed enum of exactly three values, never free text.
  constraint listings_condition_enum check (condition in ('brand_new', 'opened_unused', 'used')),
  constraint listings_status_enum
    check (status in ('draft', 'published', 'sold', 'removed', 'suspended')),
  -- §6.3 HARD RULE: `used` requires condition_notes >= 20 chars, enforced by
  -- Zod and by database constraint.
  constraint listings_condition_notes_required_when_used
    check (condition <> 'used' or char_length(coalesce(condition_notes, '')) >= 20),
  -- §6.3 HARD RULE: `used` requires at least one photo tagged as wear
  -- evidence via flaw_photo_indexes, enforced by Zod and by database
  -- constraint. array_length() returns NULL (not 0) for an empty array, and
  -- NULL passes a CHECK constraint — coalesce to 0 so an empty array is
  -- actually rejected, not silently allowed through.
  constraint listings_flaw_photo_required_when_used
    check (condition <> 'used' or coalesce(array_length(flaw_photo_indexes, 1), 0) >= 1),
  -- §7.1: photo_urls max is a single global cap (8); the per-category minimum
  -- is enforced at the registry/Zod boundary, not here (no PRD HARD RULE
  -- demands a cross-table DB constraint for it, unlike condition_notes above).
  constraint listings_photo_urls_max check (array_length(photo_urls, 1) <= 8)
);

comment on column public.listings.attribute_schema_version is
  'PRD §6.1/§6.2: written from the category registry''s SCHEMA_VERSION at insert. '
  'When a category''s Zod schema changes, the version increments and old listings '
  'remain readable at their original version. Never recomputed.';

-- §7.1 HARD RULE: a published listing is immutable in price_kobo, condition,
-- and category_id. To change any of these the seller removes and relists.
create function public.prevent_published_listing_core_field_changes()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' and (
    new.price_kobo is distinct from old.price_kobo
    or new.condition is distinct from old.condition
    or new.category_id is distinct from old.category_id
  ) then
    raise exception
      'price_kobo, condition, and category_id are immutable on a published listing (PRD §7.1). Remove and relist instead.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger prevent_published_listing_core_field_changes
  before update on public.listings
  for each row
  execute function public.prevent_published_listing_core_field_changes();

-- §7.1 HARD RULE: seller_listing_index is assigned at publish time by this
-- trigger, never by application code — it is the basis of the primary
-- metric (§3.1) and must not be racy. An advisory lock keyed on seller_id
-- serialises concurrent publishes by the same seller within the
-- transaction, so two simultaneous publishes can never receive the same
-- index. Counts across all of a seller's listings regardless of current
-- status, so a later-removed listing still occupies its original slot in
-- the sequence. Rows that are not (yet) published get a 0 sentinel, which
-- MAX() naturally ignores once the row is later published.
create function public.assign_seller_listing_index()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    perform pg_advisory_xact_lock(hashtext(new.seller_id::text)::bigint);

    select coalesce(max(seller_listing_index), 0) + 1
      into new.seller_listing_index
      from public.listings
      where seller_id = new.seller_id;

    new.published_at := coalesce(new.published_at, now());
  elsif tg_op = 'INSERT' then
    new.seller_listing_index := 0;
  end if;

  return new;
end;
$$;

create trigger assign_seller_listing_index
  before insert or update on public.listings
  for each row
  execute function public.assign_seller_listing_index();

create function public.set_listings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_listings_updated_at
  before update on public.listings
  for each row
  execute function public.set_listings_updated_at();

-- Indexes — PRD §7.1, verbatim.
create index listings_status_category_id_published_at_idx
  on public.listings (status, category_id, published_at desc);
create index listings_seller_id_published_at_idx
  on public.listings (seller_id, published_at desc);
create index listings_category_id_price_kobo_published_idx
  on public.listings (category_id, price_kobo)
  where status = 'published';
create index listings_attributes_gin_idx
  on public.listings using gin (attributes);
create index listings_title_description_fts_idx
  on public.listings using gin (to_tsvector('english', title || ' ' || description));
create index listings_seller_id_seller_listing_index_idx
  on public.listings (seller_id, seller_listing_index);

alter table public.listings enable row level security;

-- §7.2: "Public read where status = 'published'. Owner full access to own.
-- Admin all." Admin goes through the service-role client (bypasses RLS),
-- same precedent as every other table in this project.
create policy "listings_select_published"
  on public.listings for select
  to anon, authenticated
  using (status = 'published');

create policy "listings_select_own"
  on public.listings for select
  to authenticated
  using (auth.uid() = seller_id);

create policy "listings_insert_own"
  on public.listings for insert
  to authenticated
  with check (auth.uid() = seller_id);

create policy "listings_update_own"
  on public.listings for update
  to authenticated
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

-- No delete policy: PRD Epic B4 AC4 removes a listing by setting
-- status = 'removed', never by deleting the row.
