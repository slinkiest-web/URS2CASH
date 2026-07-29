-- Fixes: table-level GRANTs were never issued for anon/authenticated/service_role
-- on any base table, so every RLS policy in this schema has been unreachable —
-- Postgres denies at the GRANT layer before RLS is ever evaluated. Verified via
-- supabase db reset against a live instance: anon SELECT on categories/listings,
-- authenticated INSERT on ratings, and service_role SELECT on listings all
-- returned "permission denied for table X". Root cause: tables created by the
-- postgres role (every migration in this project) do not inherit Supabase's
-- public-schema default-privilege grant the way supabase_admin-owned objects
-- do — see docs/DECISIONS.md #18, which flagged this as an open risk.
--
-- Grants below are scoped to exactly what each table's RLS policies already
-- enforce (PRD §7.2) — never broader. RLS then narrows further by row.
-- "Admin all" is implemented by the service_role client bypassing RLS entirely
-- (docs/DECISIONS.md #7, #20), so admin access means granting service_role
-- full privileges, not a separate admin-role grant.

-- profiles: public read via profiles_public (already granted). Self read/update
-- of the base row is authenticated-only. Insert happens only via the
-- SECURITY DEFINER handle_new_user trigger — never a direct client insert.
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

-- payout_accounts: owner read/write only, never public.
grant select, insert, update on public.payout_accounts to authenticated;
grant select, insert, update, delete on public.payout_accounts to service_role;

-- categories: public read, admin write only.
grant select on public.categories to anon, authenticated;
grant select, insert, update, delete on public.categories to service_role;

-- listings: public read of published, owner full access to own. No DELETE for
-- authenticated — removeListing sets status = 'removed', rows are never
-- actually deleted by a user.
grant select on public.listings to anon;
grant select, insert, update on public.listings to authenticated;
grant select, insert, update, delete on public.listings to service_role;

-- orders: buyer/seller read own. HARD RULE: no user write at all, including
-- creation — checkout and every state transition run through the
-- service-role client. authenticated gets SELECT only, deliberately no
-- INSERT/UPDATE/DELETE.
grant select on public.orders to authenticated;
grant select, insert, update, delete on public.orders to service_role;

-- disputes: participants read own, participants insert (raiseDispute runs as
-- the caller). Resolution is admin/service-role only — no UPDATE grant for
-- authenticated.
grant select, insert on public.disputes to authenticated;
grant select, insert, update, delete on public.disputes to service_role;

-- payouts: seller reads own. Admin all, no user write.
grant select on public.payouts to authenticated;
grant select, insert, update, delete on public.payouts to service_role;

-- ratings: public read via ratings_public (already granted). Base table:
-- buyer insert only. HARD RULE: ratings are immutable — no update, no
-- delete, for any role. Admin's is_hidden update is the one documented
-- exception, so service_role gets UPDATE but deliberately never DELETE —
-- "there is no updateRating and no deleteRating" is otherwise absolute.
grant select, insert on public.ratings to authenticated;
grant select, insert, update on public.ratings to service_role;

-- moderation_flags: admin only. No anon/authenticated grant at all — RLS has
-- zero policies for either role, so granting here would open a door RLS
-- immediately slams shut: no capability gained, just confusion.
grant select, insert, update, delete on public.moderation_flags to service_role;

-- webhook_events: service role only, no client access whatsoever.
grant select, insert, update, delete on public.webhook_events to service_role;

-- Prevent this exact class of bug on every future table: service_role's real
-- authorization boundary is "did this call come from a trusted server
-- action," never table grants, so it's always safe to give it full CRUD by
-- default going forward. anon/authenticated are deliberately NOT covered by
-- a blanket default here — their correct grant is table-specific (e.g.
-- orders must stay at zero write) — so future migrations must keep declaring
-- GRANTs alongside RLS policies, same as the existing HARD RULE that both
-- live in the same migration as the table they protect.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
