-- Lowers every category's photo minimum to 1. §6.4's original per-category
-- minimums (3-5 photos) were a real barrier to listing for everyday sellers
-- in this market — most have exactly one photo of an item at hand. The
-- registry (src/lib/categories/schemas/*.ts, the actual source of truth for
-- validation) was updated in the same change; this migration keeps
-- categories.photo_min from drifting out of sync with it, even though no
-- current code path reads this column for enforcement.

update public.categories set photo_min = 1;
