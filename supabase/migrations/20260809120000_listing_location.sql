-- Per-listing location (design/UX pass, 2026-08-09). Nullable, listing-
-- level (not a category attribute) — a seller's profile.state already
-- exists as a default; these columns let a specific listing override it
-- (e.g. an item actually located somewhere else). Never forced: both
-- nullable, no CHECK constraint on state's value (validated by Zod's
-- existing nigerianStateSchema at the write boundary, same pattern as
-- every other listing-level field).

alter table public.listings
  add column location_state text,
  add column location_city text;
