-- Day One guests (DECISIONS.md, 8 November 2026).
--
-- The first 50 people with a confirmed seat before the official launch
-- (1 December 2026, 00:00 Singapore time) get a numbered "Day One" badge on
-- their profile for good. A seat counts whether they booked it or took a seat
-- a friend booked for them (00050). Numbers go in order of the confirmed
-- booking or the claimed seat, and never change. A later cancel does not take
-- the badge away. Deleting a row (ops, for a test account) frees that number
-- for the next guest.
--
-- Additive. Apply on staging, then production, before merging the release.
-- Safe to run more than once. Needs 00050.

create table if not exists public.day_one_guests (
  user_id uuid primary key references public.users (id) on delete cascade,
  number integer not null unique,
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint day_one_guests_number_range check (number between 1 and 50)
);

alter table public.day_one_guests enable row level security;
revoke all on table public.day_one_guests from public, anon, authenticated;
grant select on table public.day_one_guests to service_role;

-- One place for the two rules, so the triggers, the backfill and the public
-- readers cannot disagree.
create or replace function public.day_one_limit()
returns integer
language sql
immutable
as $$ select 50 $$;

create or replace function public.day_one_ends_at()
returns timestamptz
language sql
immutable
as $$ select timestamptz '2026-12-01 00:00:00+08' $$;

-- Gives p_user the next number if they have none, spots remain and launch
-- has not happened. Serialised with an advisory lock so two confirmations at
-- the same moment cannot take the same number.
create or replace function public.award_day_one(
  p_user uuid,
  p_booking uuid,
  p_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  if p_user is null or p_at >= public.day_one_ends_at() then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.day_one_guests'));

  select d.number into v_number from public.day_one_guests d where d.user_id = p_user;
  if v_number is not null then
    return v_number;
  end if;

  -- Lowest free number, so a row deleted by ops (a test account) frees its
  -- number instead of breaking the sequence.
  select min(n) into v_number
  from generate_series(1, public.day_one_limit()) n
  where not exists (select 1 from public.day_one_guests d where d.number = n);
  if v_number is null then
    return null;
  end if;

  insert into public.day_one_guests (user_id, number, booking_id, created_at)
  values (p_user, v_number, p_booking, p_at);
  return v_number;
end;
$$;

revoke all on function public.award_day_one(uuid, uuid, timestamptz) from public, anon, authenticated;

-- A booking becomes confirmed (stripe-webhook, confirm_paid_booking).
-- Never blocks the booking: any error is only a warning.
create or replace function public.day_one_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    begin
      perform public.award_day_one(new.guest_id, new.id);
    exception when others then
      raise warning 'day one award failed for booking %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists day_one_on_booking on public.bookings;
create trigger day_one_on_booking
  after insert or update of status on public.bookings
  for each row execute function public.day_one_on_booking();

-- A friend takes a seat on a confirmed booking.
create or replace function public.day_one_on_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.bookings b where b.id = new.booking_id and b.status = 'confirmed') then
    begin
      perform public.award_day_one(new.user_id, new.booking_id);
    exception when others then
      raise warning 'day one award failed for seat %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists day_one_on_seat on public.booking_guests;
create trigger day_one_on_seat
  after insert on public.booking_guests
  for each row execute function public.day_one_on_seat();

-- Backfill: everyone with a confirmed seat so far, oldest first. Re-running
-- changes nothing (people who have a number keep it).
do $$
declare
  r record;
begin
  for r in
    select x.user_id, x.booking_id, x.at
    from (
      select b.guest_id as user_id, b.id as booking_id, b.created_at as at
      from public.bookings b
      where b.status = 'confirmed'
      union all
      select g.user_id, g.booking_id, g.joined_at
      from public.booking_guests g
      join public.bookings b on b.id = g.booking_id
      where b.status = 'confirmed'
    ) x
    where x.at < public.day_one_ends_at()
    order by x.at, x.booking_id
  loop
    perform public.award_day_one(r.user_id, r.booking_id, r.at);
  end loop;
end $$;

-- Public: someone's Day One number for their profile, or null.
create or replace function public.day_one_number(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select d.number from public.day_one_guests d where d.user_id = p_user_id;
$$;

revoke all on function public.day_one_number(uuid) from public;
grant execute on function public.day_one_number(uuid) to anon, authenticated;

-- Public: for the site banner. Spots left and when the offer ends.
create or replace function public.day_one_status()
returns table (spots_left integer, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select greatest(public.day_one_limit() - (select count(*)::integer from public.day_one_guests), 0),
         public.day_one_ends_at();
$$;

revoke all on function public.day_one_status() from public;
grant execute on function public.day_one_status() to anon, authenticated;
