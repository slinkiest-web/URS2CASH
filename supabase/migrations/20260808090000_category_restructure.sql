-- Category restructure (design/UX pass, 2026-08-07/08).
--
-- 1. Flips Fashion from "opening soon" (browsable = false, the deliberate
--    founding-seller state) to browsable = true — a genuine product
--    decision, not a bug fix. Written as an UPDATE (not baked into
--    seed.sql's on-conflict-do-nothing insert) so it takes effect in every
--    environment a migration runs in, not just a fresh local `db reset`.
-- 2. Adds the new Gym & Activewear category, browsable from birth (no
--    "opening soon" period — this is a deliberate launch choice, not an
--    oversight). Mirrors src/lib/categories/registry.ts's gym_activewear
--    entry exactly.
--
-- No listings.attributes reshaping happens here — the Beauty/Fashion
-- product_type -> product_group/product_subtype restructure lives entirely
-- in each category's Zod schema (JSONB, schema-validated at the
-- application boundary, never DB-shaped). Existing listings keep reading
-- fine at their original attribute_schema_version; only a future edit of
-- an old-shape listing would need to satisfy the new schema.

update public.categories
set browsable = true
where slug = 'fashion';

insert into public.categories (slug, name, listable, browsable, photo_min, allowed_conditions, sort_order)
values
  ('gym_activewear', 'Gym & Activewear', true, true, 1, array['brand_new', 'opened_unused', 'used'], 6)
on conflict (slug) do nothing;
