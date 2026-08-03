-- Seeds the launch categories. PRD §6.4.
-- Values mirror src/lib/categories/registry.ts exactly — see the startup
-- assertion note in docs/KNOWN_ISSUES.md for why that match isn't yet
-- automated.
--
-- This is the ONLY place these five original rows are created — no
-- migration inserts them, so `on conflict (slug) do nothing` normally means
-- "leave a real deployment's row untouched." That has one sharp edge: this
-- file runs on every local `db reset`, LAST, after every migration
-- (including 20260808090000_category_restructure.sql's `update ... set
-- browsable = true where slug = 'fashion'`). On a fresh reset the fashion
-- row doesn't exist yet when that UPDATE runs, so it's a no-op — and this
-- INSERT then creates the row fresh, whatever literal value is written
-- here wins. Fashion's `browsable` below must stay in sync with that
-- migration's intent (true), or a `db reset` silently reverts it. Learned
-- the hard way during the 2026-08-07/08 category restructure.

insert into public.categories (slug, name, listable, browsable, photo_min, allowed_conditions, sort_order)
values
  ('beauty', 'Beauty', true, true, 1, array['brand_new', 'opened_unused', 'used'], 1),
  ('fashion', 'Fashion', true, true, 1, array['brand_new', 'opened_unused', 'used'], 2),
  ('gadgets', 'Gadgets', true, false, 1, array['brand_new', 'opened_unused', 'used'], 3),
  ('personal_care', 'Personal Care', true, false, 1, array['brand_new', 'opened_unused'], 4),
  ('home_goods', 'Home Goods', true, false, 1, array['brand_new', 'opened_unused', 'used'], 5)
on conflict (slug) do nothing;
