-- Seeds the five launch categories. PRD §6.4.
-- Values mirror src/lib/categories/registry.ts exactly — see the startup
-- assertion note in docs/KNOWN_ISSUES.md for why that match isn't yet
-- automated.

insert into public.categories (slug, name, listable, browsable, photo_min, allowed_conditions, sort_order)
values
  ('beauty', 'Beauty', true, true, 3, array['brand_new', 'opened_unused', 'used'], 1),
  ('fashion', 'Fashion', true, false, 4, array['brand_new', 'opened_unused', 'used'], 2),
  ('gadgets', 'Gadgets', true, false, 5, array['brand_new', 'opened_unused', 'used'], 3),
  ('personal_care', 'Personal Care', true, false, 3, array['brand_new', 'opened_unused'], 4),
  ('home_goods', 'Home Goods', true, false, 4, array['brand_new', 'opened_unused', 'used'], 5)
on conflict (slug) do nothing;
