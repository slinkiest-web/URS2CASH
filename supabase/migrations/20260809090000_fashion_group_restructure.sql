-- Fashion group restructure (design/UX pass, 2026-08-09).
--
-- Schema-level changes live in src/lib/categories/schemas/fashion.ts:
--   - "Outerwear" folded into "Tops" (jackets/coats become Tops subtypes)
--   - "Bottoms" group key renamed to "trousers" (label "Trousers")
--   - "Traditional" promoted from an Other-subtype to its own top-level
--     group with real subtypes (Ankara, Agbada, Aso-ebi, Buba, Kaftan)
--
-- This migration rewrites the JSONB attributes of any EXISTING listing so
-- stored data matches the new taxonomy, not just new writes going forward
-- — same "nothing becomes unlistable" discipline as every other schema
-- change this session. All three updates are scoped to the fashion
-- category so a coincidental JSONB key match elsewhere can't be touched.

update public.listings
set attributes = jsonb_set(attributes, '{product_group}', '"trousers"')
where category_id = (select id from public.categories where slug = 'fashion')
  and attributes->>'product_group' = 'bottoms';

-- Subtype keys (jackets/coats) are unchanged — only the parent group moves.
update public.listings
set attributes = jsonb_set(attributes, '{product_group}', '"tops"')
where category_id = (select id from public.categories where slug = 'fashion')
  and attributes->>'product_group' = 'outerwear';

-- The old `other`/`traditional` pairing had no way to know which specific
-- Traditional subtype it was — promoted to the new group with the subtype
-- cleared, rather than guessed.
update public.listings
set attributes = (attributes - 'product_subtype') || jsonb_build_object('product_group', 'traditional')
where category_id = (select id from public.categories where slug = 'fashion')
  and attributes->>'product_group' = 'other'
  and attributes->>'product_subtype' = 'traditional';
