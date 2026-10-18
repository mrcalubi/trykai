-- Audit trail for dispute and refund actions (DECISIONS.md, 19 October,
-- "Dispute and refund actions are auditable").
--
-- booking_money_events: one row per admin-dispute-booking hold,
-- release_hold, and partial_refund, and per admin-cancel-booking cancel.
-- actor_user_id is the admin whose JWT made the call; it is null only for
-- the x-admin-secret break-glass path (auth_method 'break_glass', operator
-- name in note) or a system writer (auth_method 'system', e.g. a webhook).
--
-- A hold's note starts with its code ('dispute: ...', 'chargeback: ...') so
-- the history keeps the code after the hold is cleared.
--
-- Admin-only: RLS on with no policies, no grants to anon or authenticated.
-- Read it in SQL Editor. service_role may SELECT and INSERT only, and a
-- trigger refuses UPDATE, DELETE and TRUNCATE for everyone, so history
-- cannot be rewritten through the API.
--
-- No foreign keys on purpose: bookings cascade from users, and the money
-- history has to outlive (and must not block) that cascade. actor_user_id
-- is the same: an admin's account can go, their actions stay.
--
-- bookings.payout_hold_reason is readable by the booking's guest and host
-- (RLS, 00009), so it is now a neutral code only: 'dispute' or
-- 'chargeback'. Free-text hold reasons written under 00029 are copied into
-- a 'hold' event note and the column is reset to 'dispute'.
--
-- Safe to run more than once.

create table if not exists public.booking_money_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  action text not null check (
    action in ('hold', 'release_hold', 'partial_refund', 'admin_cancel')
  ),
  actor_user_id uuid,
  auth_method text not null check (auth_method in ('admin_jwt', 'break_glass', 'system')),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  host_payout_before integer,
  host_payout_after integer,
  stripe_object_id text,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  constraint booking_money_events_actor_matches_method check (
    (auth_method = 'admin_jwt' and actor_user_id is not null)
    or (auth_method <> 'admin_jwt' and actor_user_id is null)
  )
);

create index if not exists booking_money_events_booking_idx
  on public.booking_money_events (booking_id, created_at);

create index if not exists booking_money_events_actor_idx
  on public.booking_money_events (actor_user_id, created_at)
  where actor_user_id is not null;

alter table public.booking_money_events enable row level security;

revoke all on table public.booking_money_events from public, anon, authenticated, service_role;
grant select, insert on table public.booking_money_events to service_role;

create or replace function public.booking_money_events_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'booking_money_events is append-only (% refused)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function public.booking_money_events_append_only() from public, anon, authenticated;

drop trigger if exists booking_money_events_no_update_delete on public.booking_money_events;
create trigger booking_money_events_no_update_delete
  before update or delete on public.booking_money_events
  for each row execute function public.booking_money_events_append_only();

drop trigger if exists booking_money_events_no_truncate on public.booking_money_events;
create trigger booking_money_events_no_truncate
  before truncate on public.booking_money_events
  for each statement execute function public.booking_money_events_append_only();

-- Move any free-text hold reason into the log, once per held booking.
insert into public.booking_money_events (
  booking_id, action, auth_method, host_payout_before, host_payout_after, note, created_at
)
select
  b.id,
  'hold',
  'system',
  b.host_payout_amount,
  b.host_payout_amount,
  left('dispute: migrated from bookings.payout_hold_reason (00030): ' || b.payout_hold_reason, 2000),
  coalesce(b.payout_held_at, now())
from public.bookings b
where b.payout_hold_reason is not null
  and b.payout_hold_reason not in ('dispute', 'chargeback')
  and not exists (
    select 1
    from public.booking_money_events e
    where e.booking_id = b.id
      and e.action = 'hold'
      and e.note like 'dispute: migrated from bookings.payout_hold_reason (00030):%'
  );

update public.bookings
set payout_hold_reason = 'dispute'
where payout_hold_reason is not null
  and payout_hold_reason not in ('dispute', 'chargeback');

alter table public.bookings
  drop constraint if exists bookings_payout_hold_reason_code;
alter table public.bookings
  add constraint bookings_payout_hold_reason_code
  check (payout_hold_reason is null or payout_hold_reason in ('dispute', 'chargeback'));

comment on column public.bookings.payout_hold_reason is
  'Neutral hold code (dispute | chargeback). Guest and host can read it. Details go in booking_money_events.note.';
comment on table public.booking_money_events is
  'Append-only, admin-only log of payout holds, dispute refunds, and admin cancels. Service role writes.';
