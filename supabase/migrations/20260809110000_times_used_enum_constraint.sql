-- Replaces free-text "times worn/used" with a fixed 3-option dropdown
-- (design/UX pass, 2026-08-09) — easy for anyone to answer, still
-- optional. Defense-in-depth DB CHECK alongside the Zod enum, matching
-- this project's established pattern (e.g. flaw_photo_indexes,
-- condition_notes length). No existing listing has times_used set today
-- (verified against the live DB), so this is safe with no data to migrate
-- or lose.

alter table public.listings
  add constraint listings_times_used_check
  check (times_used is null or times_used in ('never_worn', 'worn_a_few_times', 'worn_often'));
