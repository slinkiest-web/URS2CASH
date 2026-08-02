-- Sell-flow friction removal (design/UX pass, 2026-08-07).
--
-- 1. `used` no longer forces condition_notes/flaw_photo_indexes at all — the
--    product decision is that "has flaws" is an independent, always-optional
--    question from condition, never a blocking one. Drops both HARD-RULE
--    CHECK constraints from the original PRD §6.3 schema.
-- 2. `description` loses its 20-character floor (still capped at 1500) — the
--    listing-level "description" and "condition notes" concepts are merged
--    into one free-text field in the UI, and neither is required to publish.
-- 3. Two new optional listing-level columns for the softer, more human sell
--    flow: `reason_for_selling`, `times_used`. Both free text, both
--    genuinely optional (no CHECK, nullable), apply to every category.

alter table public.listings
  drop constraint listings_condition_notes_required_when_used;

alter table public.listings
  drop constraint listings_flaw_photo_required_when_used;

alter table public.listings
  drop constraint listings_description_length;

alter table public.listings
  add constraint listings_description_length check (char_length(description) <= 1500);

alter table public.listings
  add column reason_for_selling text,
  add column times_used text;

comment on column public.listings.reason_for_selling is
  'Optional free text, every category. Sell-flow humanization pass — never required, never validated beyond length.';
comment on column public.listings.times_used is
  'Optional free text, every category (e.g. "3 times", "daily for 2 months"). Supersedes Fashion''s old structured times_worn_band for a more human, less exam-like field.';
