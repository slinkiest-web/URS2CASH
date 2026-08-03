-- Gym & Activewear merged into Fashion as its "Activewear" subcategory
-- (design/UX pass, 2026-08-09) — no longer a standalone top-level
-- category. Schema-level change lives in src/lib/categories/schemas/
-- fashion.ts (the "activewear" group, ranked 2nd for top-3 prominence);
-- src/lib/categories/schemas/gym-activewear.ts is deleted.
--
-- Two subtype keys were renamed to avoid colliding with existing Fashion
-- subtype keys: gym's `shorts` -> `gym_shorts` (Fashion's Trousers group
-- already has `shorts`), gym's `jacket` -> `track_jacket` (Fashion's Tops
-- group already has `jackets`). Gym's own `set`/`other` product types
-- don't become Activewear subtypes — they map to Fashion's existing
-- top-level Sets/Other groups instead, same reasoning as the earlier
-- suit -> Sets call.
--
-- Every existing gym_activewear listing is migrated (category_id
-- reassigned to fashion, attributes reshaped from the old flat
-- `product_type` into `product_group`/`product_subtype`) BEFORE the
-- category row is deleted. The delete relies on listings.category_id's
-- foreign key (no ON DELETE clause = RESTRICT) to fail loudly if any row
-- was somehow missed, rather than silently orphaning data.

-- §7.1's prevent_published_listing_core_field_changes trigger (correctly)
-- blocks a seller from editing category_id on their own published
-- listing — it is not meant to block a genuine admin/migration data
-- move. Disabled for just this one statement, scoped to this table, then
-- immediately re-enabled — the protection resumes for every normal
-- write the instant this migration finishes.
alter table public.listings disable trigger prevent_published_listing_core_field_changes;

update public.listings
set
  category_id = (select id from public.categories where slug = 'fashion'),
  attributes = (attributes - 'product_type') || jsonb_strip_nulls(jsonb_build_object(
    'product_group',
    case attributes->>'product_type'
      when 'set' then 'sets'
      when 'other' then 'other'
      else 'activewear'
    end,
    'product_subtype',
    case attributes->>'product_type'
      when 'leggings' then 'leggings'
      when 'sports_bra' then 'sports_bra'
      when 'shorts' then 'gym_shorts'
      when 'tank_top' then 'tank_top'
      when 'jacket' then 'track_jacket'
      when 'tracksuit' then 'tracksuit'
      when 'gym_shoes' then 'gym_shoes'
      else null
    end
  ))
where category_id = (select id from public.categories where slug = 'gym_activewear');

alter table public.listings enable trigger prevent_published_listing_core_field_changes;

delete from public.categories where slug = 'gym_activewear';
