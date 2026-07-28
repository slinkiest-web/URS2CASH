-- PRD §7.1 profiles, §7.1 payout_accounts, §7.2 RLS, Epic A (auto-created profile row).
-- HARD RULE (PRD §12.1 / §7.2): RLS ships in the same migration as the table it protects.

-- =============================================================================
-- profiles
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  handle text not null unique,
  avatar_url text,
  bio text,
  phone text,
  -- Deviation from PRD §7.1's literal "NOT NULL" on `state`: the profiles row is
  -- created automatically at signup (Epic A1 AC1), before the seller has supplied
  -- a state (Epic A3). Nullable here; required at the application/Zod boundary
  -- when the seller completes her profile (A3 AC1). Flagged for confirmation.
  state text,
  is_suspended boolean not null default false,
  -- Denormalised, maintained by trigger — never aggregated at read time (§7.1).
  completed_sales_count integer not null default 0,
  rating_average numeric(2, 1),
  rating_count integer not null default 0,
  dispute_upheld_count integer not null default 0,
  -- Admin escape hatch (§5.4). NULL means "use the tier".
  listing_limit_override integer,
  created_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 2 and 50),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 280),
  constraint profiles_phone_format check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$')
);

-- HARD RULE (PRD §7.1, §15.1 B2): is_verified does not exist. There is no
-- verification badge in MVP. Do not add it back.

comment on table public.profiles is 'Extends auth.users. PRD §7.1.';
comment on column public.profiles.state is
  'Nullable at signup; required by the Zod schema on the profile-completion form (Epic A3 AC1).';

alter table public.profiles enable row level security;

-- Self read/update only at the base-table level. Public read of non-suspended
-- profiles (§7.2) is served through public.profiles_public below, which
-- excludes phone and admin-only columns — RLS is row-level, not column-level,
-- so a public row policy here would also expose `phone` to every reader.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert policy for authenticated/anon: profiles rows are created only by
-- the handle_new_user trigger below (Epic A1 AC1), never by client code.
-- No delete policy: profiles are not deletable by any client role.

-- Public, non-sensitive projection of profiles, for seller public profile
-- pages (Epic C4) and listing detail seller-reputation blocks (Epic C3 AC5).
-- Excludes phone, dispute_upheld_count, and listing_limit_override.
-- Owned by the migration role (postgres), which bypasses RLS on the base
-- table, so this view can read across all profiles while the base table
-- itself stays owner-only.
create view public.profiles_public
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
    created_at
  from public.profiles
  where is_suspended = false;

grant select on public.profiles_public to anon, authenticated;

-- =============================================================================
-- payout_accounts
-- =============================================================================

create table public.payout_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  bank_code text not null,
  bank_name text not null,
  account_number text not null,
  -- HARD RULE (PRD §7.1): account name is never accepted from user input. It
  -- is resolved via Paystack's account resolution endpoint and stored from
  -- the response. Enforced in the resolveAndSavePayoutAccount server action,
  -- not at the schema level (the column itself accepts any text write).
  account_name text not null,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint payout_accounts_account_number_format check (account_number ~ '^[0-9]{10}$')
);

create index payout_accounts_profile_id_idx on public.payout_accounts (profile_id);

alter table public.payout_accounts enable row level security;

-- Owner read and write only. Never public (§7.2).
create policy "payout_accounts_select_own"
  on public.payout_accounts for select
  to authenticated
  using (auth.uid() = profile_id);

create policy "payout_accounts_insert_own"
  on public.payout_accounts for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "payout_accounts_update_own"
  on public.payout_accounts for update
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- =============================================================================
-- Auto-create a profiles row on signup (Epic A1 AC1, AC5)
-- =============================================================================

-- Slugifies `base`, deduplicating against existing handles with a numeric
-- suffix on collision (Epic A1 AC5).
create function public.generate_unique_handle(base text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
  v_candidate text;
  v_suffix integer := 1;
begin
  v_slug := lower(regexp_replace(coalesce(base, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);

  if v_slug = '' then
    v_slug := 'user';
  end if;

  -- profiles_handle_format caps at 40 chars; leave room for a '-<suffix>'.
  v_slug := left(v_slug, 32);
  if char_length(v_slug) < 2 then
    v_slug := rpad(v_slug, 2, '0');
  end if;

  -- Serializes concurrent signups that derive the same base slug, so two
  -- transactions can never both observe a candidate as free before either
  -- commits. Same advisory-lock pattern as assign_seller_listing_index
  -- (20260727215742_categories_listings.sql), which solves the equivalent
  -- race on seller_listing_index.
  perform pg_advisory_xact_lock(hashtext(v_slug)::bigint);

  v_candidate := v_slug;

  while exists (select 1 from public.profiles where handle = v_candidate) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_slug || '-' || v_suffix;
  end loop;

  return v_candidate;
end;
$$;

-- HARD RULE (Epic A1 AC1): the profiles row is created in the same
-- transaction as the auth.users row, by this trigger — never by client code.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display_name text;
begin
  v_display_name := split_part(new.email, '@', 1);
  v_display_name := left(regexp_replace(v_display_name, '[^[:alnum:]._-]+', '', 'g'), 50);
  if char_length(v_display_name) < 2 then
    v_display_name := rpad(v_display_name, 2, '0');
  end if;

  insert into public.profiles (id, display_name, handle)
  values (
    new.id,
    v_display_name,
    public.generate_unique_handle(v_display_name)
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
