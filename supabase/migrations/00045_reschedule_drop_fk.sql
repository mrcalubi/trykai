-- 00044 first shipped `rescheduled_from_session_id` with a foreign key to
-- sessions. That gave PostgREST two relationships between bookings and
-- sessions, so every `bookings (...)` / `sessions (...)` embed failed as
-- ambiguous (PGRST201): the Bookings and Hosting tabs, checkout confirmation,
-- cancellations, payouts and reminders. 00044 no longer adds the key; this
-- drops it where the first version was applied (staging). No-op elsewhere.
-- Sessions are never hard-deleted, so the column needs no constraint.
-- Safe to run more than once.

alter table public.bookings
  drop constraint if exists bookings_rescheduled_from_session_id_fkey;

notify pgrst, 'reload schema';
