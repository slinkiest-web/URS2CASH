-- PRD §10 Epic C3 AC6: "Sold listings display as sold and are not
-- purchasable" — which requires a sold listing's detail page to still be
-- reachable by a buyer, not 404. The original listings_select_published
-- policy (20260727215742_categories_listings.sql) only allowed
-- status = 'published', so once a listing transitions to 'sold' it would
-- become invisible to every non-owner role, contradicting AC6. Widened to
-- also allow 'sold' — no other status (draft/removed/suspended) is public.
drop policy if exists "listings_select_published" on public.listings;

create policy "listings_select_published_or_sold"
  on public.listings for select
  to anon, authenticated
  using (status in ('published', 'sold'));
