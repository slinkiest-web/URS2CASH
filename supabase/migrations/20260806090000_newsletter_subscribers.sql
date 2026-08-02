-- Footer newsletter signup (urs2cash-ui skill, Revision 4). A real capture
-- table, not a decorative form with nowhere for the email to go — the
-- design system's own rule against inventing a signal that isn't real
-- applies to functionality too, not just visual trust badges.

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

-- Anyone (including anonymous visitors) can subscribe. No SELECT policy for
-- anon/authenticated — the list is only ever read by an operator via the
-- service-role client, matching this project's existing admin-read pattern
-- (moderation_flags, webhook_events).
create policy "newsletter_subscribers_insert_anyone"
  on public.newsletter_subscribers for insert
  to anon, authenticated
  with check (true);

grant insert on public.newsletter_subscribers to anon, authenticated;
