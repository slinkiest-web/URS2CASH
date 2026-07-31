-- PRD §10 Epic D6 (every AC), §7.1 (ratings table, already built Prompt 5),
-- §9.2 (rating_average floor), §11.2 (submitRating), §9.3 (review scanning).
-- Prompt 18.
--
-- Scope note: `ratings`, its RLS (buyer-insert-on-concluded-order only, no
-- update/delete for anyone), `ratings_public`, and `recompute_seller_rating`
-- (the rating_count/rating_average trigger, NULL below 3) all already exist
-- (Prompts 5/6) — nothing to change there. This migration only adds the
-- column AC10's 72-hour reminder needs to enforce "no further reminders."

alter table public.orders
  add column rating_reminder_sent_at timestamptz;

comment on column public.orders.rating_reminder_sent_at is
  'Set once by the rating-reminder cron (§10 Epic D6 AC10: "one reminder at 72 hours if unrated, no further reminders") — NULL until the reminder fires, never reset. Not a rating_prompt_shown dedup for the initial on-page prompt, only for the delayed cron reminder.';
