-- PRD §7.1 orders, disputes, ratings, payouts, moderation_flags, webhook_events.
-- §7.2 RLS, §8 order lifecycle, §9.3 moderation detail.
-- HARD RULE (PRD §12.1 / §7.2): RLS ships in the same migration as the table it protects.
--
-- Scope note: this prompt's own instructions asked for an `order_events`
-- table (no PRD reference anywhere) in place of `disputes` (a real PRD §7.1
-- table with its own §7.2 RLS row, required by Epic D5/E2). Per your
-- decision, this migration builds `disputes`, not `order_events`. See
-- docs/DECISIONS.md for this and every other resolved conflict below.

-- =============================================================================
-- orders
-- =============================================================================

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings (id),
  buyer_id uuid not null references public.profiles (id),
  seller_id uuid not null references public.profiles (id),
  status text not null default 'pending',
  amount_kobo integer not null,
  commission_kobo integer not null,
  seller_payout_kobo integer not null,
  paystack_reference text unique,
  -- Released to the seller only on `paid` — enforced in the read layer
  -- (a future prompt), not by RLS. See docs/KNOWN_ISSUES.md.
  delivery_name text not null,
  delivery_state text not null,
  delivery_address text not null,
  delivery_phone text not null,
  tracking_note text,
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  released_at timestamptz,
  disputed_at timestamptz,
  refunded_at timestamptz,
  auto_release_at timestamptz,
  created_at timestamptz not null default now(),
  constraint orders_status_enum check (
    status in (
      'pending', 'paid', 'shipped', 'delivered', 'released',
      'disputed', 'refunded', 'cancelled', 'expired'
    )
  ),
  -- §7.1: amount_kobo is the listing price at purchase — mirrors
  -- listings.price_kobo's own range constraint (§7.1).
  constraint orders_amount_kobo_range check (amount_kobo between 50000 and 500000000),
  constraint orders_commission_kobo_nonnegative check (commission_kobo >= 0),
  constraint orders_seller_payout_kobo_nonnegative check (seller_payout_kobo >= 0),
  -- §8.3 HARD RULE: commission_kobo = floor(amount_kobo * 0.10), snapshotted,
  -- never recomputed. seller_payout_kobo = amount_kobo - commission_kobo.
  constraint orders_commission_formula check (commission_kobo = floor(amount_kobo * 0.10)::integer),
  constraint orders_payout_arithmetic check (seller_payout_kobo = amount_kobo - commission_kobo),
  -- Epic D1 AC10: a seller cannot purchase their own listing.
  constraint orders_buyer_not_seller check (buyer_id <> seller_id)
);

comment on table public.orders is 'PRD §7.1/§8. No delivery_fee column exists — the PRD explicitly forbids it (§8.4).';

create index orders_buyer_id_idx on public.orders (buyer_id);
create index orders_seller_id_idx on public.orders (seller_id);

alter table public.orders enable row level security;

-- §7.2: "Buyer and seller read own. No user write, all transitions via
-- server actions with service role." No insert/update/delete policy for
-- authenticated/anon at all — even initial order creation goes through a
-- server action using the service-role client, per §11.2.
create policy "orders_select_participant"
  on public.orders for select
  to authenticated
  using (auth.uid() = buyer_id or auth.uid() = seller_id);

-- =============================================================================
-- disputes
-- =============================================================================

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  raised_by uuid not null references public.profiles (id),
  reason text not null,
  detail text not null,
  evidence_urls text[] not null default '{}',
  status text not null default 'open',
  admin_notes text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  -- §10 Epic D5 AC2 / §8.4 HARD RULE take precedence over §7.1's literal
  -- table, which omits shipping_cost_dispute and uses condition_mismatch
  -- instead of not_as_described — resolved in favour of §10/§8.4 per your
  -- decision. See docs/DECISIONS.md.
  constraint disputes_reason_enum check (
    reason in (
      'not_received', 'not_as_described', 'damaged', 'wrong_item',
      'counterfeit', 'shipping_cost_dispute', 'other'
    )
  ),
  constraint disputes_detail_length check (char_length(detail) between 20 and 1000),
  constraint disputes_status_enum
    check (status in ('open', 'resolved_buyer', 'resolved_seller', 'cancelled')),
  constraint disputes_evidence_urls_max check (coalesce(array_length(evidence_urls, 1), 0) <= 6)
);

alter table public.disputes enable row level security;

-- §7.2: "Order participants read own. Participants insert. Admin all."
create policy "disputes_select_participant"
  on public.disputes for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = disputes.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
    )
  );

create policy "disputes_insert_participant"
  on public.disputes for insert
  to authenticated
  with check (
    raised_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = disputes.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
    )
  );

-- No update/delete policy: resolution is an admin action via the
-- service-role client.

-- =============================================================================
-- ratings
-- =============================================================================

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  rater_id uuid not null references public.profiles (id),
  seller_id uuid not null references public.profiles (id),
  score integer not null,
  review text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ratings_score_range check (score between 1 and 5),
  constraint ratings_review_length check (review is null or char_length(review) <= 500)
);

comment on table public.ratings is
  'PRD §7.1. order_id UNIQUE is the only duplicate-rating guard — never a read-then-write check.';

create index ratings_seller_id_idx on public.ratings (seller_id);

alter table public.ratings enable row level security;

-- §7.2: "Insert only by the order's buyer where order status is released
-- or refunded." Re-checked in the server action too (§11.2), but this is
-- the actual enforcement layer, not a convenience.
create policy "ratings_insert_buyer_on_concluded_order"
  on public.ratings for insert
  to authenticated
  with check (
    rater_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = ratings.order_id
        and o.buyer_id = auth.uid()
        and o.status in ('released', 'refunded')
    )
  );

-- No select/update/delete policy on the base table for authenticated/anon:
-- §7.2 "No update, no delete, for any role" — not even the rater. Public
-- reads go through ratings_public below, which is the only way §7.2's
-- "Public read where is_hidden = false. Score is public even when hidden."
-- is representable: RLS is row-level, so a single policy can't both hide a
-- hidden review's text AND keep that same row's score visible. Same
-- pattern as profiles_public (docs/DECISIONS.md #1). Admin updates
-- is_hidden via the service-role client, which bypasses RLS entirely.
create view public.ratings_public
  with (security_invoker = false)
  as
  select
    id,
    order_id,
    rater_id,
    seller_id,
    score,
    case when is_hidden then null else review end as review,
    is_hidden,
    created_at
  from public.ratings;

grant select on public.ratings_public to anon, authenticated;

-- =============================================================================
-- payouts
-- =============================================================================

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  seller_id uuid not null references public.profiles (id),
  payout_account_id uuid not null references public.payout_accounts (id),
  amount_kobo integer not null,
  status text not null default 'queued',
  admin_reference text,
  paid_by uuid references public.profiles (id),
  paid_at timestamptz,
  failure_note text,
  created_at timestamptz not null default now(),
  constraint payouts_status_enum check (status in ('queued', 'paid', 'failed')),
  constraint payouts_amount_kobo_positive check (amount_kobo > 0)
);

comment on table public.payouts is
  'PRD §7.1. One payout row per order, created automatically on release — never created manually by admin, never batched across orders.';

create index payouts_seller_id_idx on public.payouts (seller_id);

alter table public.payouts enable row level security;

-- §7.2: "Seller reads own. Admin all. No user write."
create policy "payouts_select_own"
  on public.payouts for select
  to authenticated
  using (auth.uid() = seller_id);

-- =============================================================================
-- moderation_flags
-- =============================================================================

create table public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id),
  source text not null,
  reason text not null,
  -- §9.3: the auto-detector's flag "carries the matched pattern type and
  -- the matched text" — richer than §7.1's literal single `reason` column.
  -- Nullable: only populated for source = auto_contact_detect. No enum on
  -- pattern_type — the detector's exact token taxonomy is an explicit open
  -- item (§14: "Contact detector regex set and threshold tuning"), not yet
  -- decided by the PRD.
  pattern_type text,
  matched_text text,
  status text not null default 'open',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint moderation_flags_source_enum
    check (source in ('auto_contact_detect', 'user_report', 'admin')),
  constraint moderation_flags_status_enum check (status in ('open', 'dismissed', 'actioned'))
);

create index moderation_flags_listing_id_idx on public.moderation_flags (listing_id);

alter table public.moderation_flags enable row level security;

-- §7.2: "Admin only." No policies for anon/authenticated — RLS enabled with
-- zero matching policies denies all access to those roles by default. Only
-- the service-role client (bypasses RLS) can reach this table.

-- =============================================================================
-- webhook_events
-- =============================================================================

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint webhook_events_provider_event_id_unique unique (provider, event_id)
);

comment on table public.webhook_events is
  'PRD §7.1. UNIQUE (provider, event_id) is the idempotency mechanism — every webhook inserts here first; a conflict means already processed, return 200, do nothing.';

alter table public.webhook_events enable row level security;

-- §7.2: "Service role only. No client access." No policies — same
-- zero-policy pattern as moderation_flags above.
