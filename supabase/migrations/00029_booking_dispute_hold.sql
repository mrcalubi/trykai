-- Guest dispute tooling (admin-dispute-booking, DECISIONS.md 19 October).
--
-- payout_hold_reason / payout_held_at: while the reason is set,
-- release-payout skips the booking with reason `dispute_hold`. The
-- 72-hour clock keeps running; clearing the hold lets the next run pay.
--
-- stripe_partial_refund_ids: partial dispute refunds. stripe_refund_id stays
-- for the full refund that cancels a booking, because release-payout treats
-- any stripe_refund_id as "do not pay the host". refund_amount is the
-- cumulative amount refunded to the guest across both.
--
-- authenticated has table-level SELECT on bookings (00009) and RLS lets the
-- guest and host read their own row, so the hold reason is visible to both.
-- Write a neutral reason, never personal details or evidence.
--
-- Safe to run more than once.

alter table public.bookings
  add column if not exists payout_hold_reason text,
  add column if not exists payout_held_at timestamptz,
  add column if not exists stripe_partial_refund_ids text[] not null default '{}';
