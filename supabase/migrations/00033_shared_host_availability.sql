-- Shared availability across a host's listings (DECISIONS.md, 20 October).
--
-- A host can't be in two places at once. A host with several listings can now
-- offer the same times on each of them; the first confirmed booking decides
-- which listing that time goes to, and every other overlapping session of the
-- same host is set aside ('held') until that booking goes away.
--
--   * confirm_paid_booking takes a per-host advisory lock first, so two
--     payments for clashing sessions of one host are handled one at a time.
--     The second sees the first's booking and raises 'session not open', which
--     stripe-webhook already treats as an oversell and refunds (00012).
--   * After confirming, it sets the host's other open, unbooked, overlapping
--     sessions to status 'held' with held_by_session_id = the booked session.
--     Public reads only show status 'open' (00001), so held sessions disappear
--     from browse and the listing page; the host still sees them.
--   * A before-insert/update trigger on sessions keeps this true whatever
--     writes the row: a session added, moved, or reopened onto a booked time is
--     held, and a held session that no longer clashes goes back to open (or
--     full). So set_listing_spots, edit_open_session and cancel-booking need no
--     changes.
--   * When the last confirmed booking on a session is cancelled, the sessions
--     it held are reopened (the trigger re-checks them).
--
-- Overlap is the same rule as 00018: [starts_at, starts_at + duration_mins).
-- Back-to-back is fine. No travel buffer (KIV).
--
-- Safe to run more than once.

alter table public.sessions
  add column if not exists held_by_session_id uuid
    references public.sessions(id) on delete set null;

create index if not exists sessions_held_by_session_id_idx
  on public.sessions (held_by_session_id)
  where held_by_session_id is not null;

-- The id of another session of the same host that overlaps the given window
-- and has a confirmed booking, or null.
create or replace function public.host_booked_overlap(
  p_host_id uuid,
  p_session_id uuid,
  p_starts_at timestamptz,
  p_duration_mins integer
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.sessions s
  join public.listings l on l.id = s.listing_id
  where l.host_id = p_host_id
    and s.id is distinct from p_session_id
    and s.status is distinct from 'cancelled'
    and s.starts_at < p_starts_at + make_interval(mins => p_duration_mins)
    and s.starts_at + make_interval(mins => s.duration_mins) > p_starts_at
    and exists (
      select 1 from public.bookings b
      where b.session_id = s.id and b.status = 'confirmed'
    )
  order by s.starts_at
  limit 1;
$$;

revoke all on function public.host_booked_overlap(uuid, uuid, timestamptz, integer) from public, anon, authenticated;

create or replace function public.apply_host_session_hold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_holder uuid;
begin
  if new.status not in ('open', 'held') or new.duration_mins is null then
    return new;
  end if;

  -- A session with its own confirmed booking is the one that holds others.
  if tg_op = 'UPDATE' and exists (
    select 1 from public.bookings
    where session_id = new.id and status = 'confirmed'
  ) then
    if new.status = 'held' then
      new.status := case when new.spots_remaining <= 0 then 'full' else 'open' end;
    end if;
    new.held_by_session_id := null;
    return new;
  end if;

  select host_id into v_host from public.listings where id = new.listing_id;
  v_holder := public.host_booked_overlap(v_host, new.id, new.starts_at, new.duration_mins);

  if v_holder is not null then
    new.status := 'held';
    new.held_by_session_id := v_holder;
  else
    if new.status = 'held' then
      new.status := case when new.spots_remaining <= 0 then 'full' else 'open' end;
    end if;
    new.held_by_session_id := null;
  end if;

  return new;
end;
$$;

revoke all on function public.apply_host_session_hold() from public, anon;
grant execute on function public.apply_host_session_hold() to authenticated;

drop trigger if exists sessions_apply_host_hold on public.sessions;

create trigger sessions_apply_host_hold
  before insert or update of starts_at, duration_mins, status on public.sessions
  for each row
  execute function public.apply_host_session_hold();

-- Same as 00012 apart from the host lock, the clash check, and holding the
-- host's other overlapping sessions after the booking is confirmed.
create or replace function public.confirm_paid_booking(
  p_booking_id uuid,
  p_stripe_charge_id text default null,
  p_host_fee integer default null,
  p_host_payout_amount integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_host uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'booking not found';
  end if;

  if v_booking.status = 'confirmed' then
    return v_booking.id;
  end if;

  if v_booking.status is distinct from 'pending' then
    raise exception 'booking not pending';
  end if;

  -- One confirmation at a time per host, taken before any session row lock so
  -- two payments for clashing sessions cannot deadlock or both succeed.
  select l.host_id
  into v_host
  from public.sessions s
  join public.listings l on l.id = s.listing_id
  where s.id = v_booking.session_id;

  if v_host is not null then
    perform pg_advisory_xact_lock(hashtextextended('trykai_host:' || v_host::text, 0));
  end if;

  select *
  into v_session
  from public.sessions
  where id = v_booking.session_id
  for update;

  if not found then
    raise exception 'session not found';
  end if;

  if v_session.status is distinct from 'open' then
    raise exception 'session not open';
  end if;

  -- The host is already booked elsewhere at this time.
  if public.host_booked_overlap(v_host, v_session.id, v_session.starts_at, v_session.duration_mins) is not null then
    raise exception 'session not open';
  end if;

  if v_session.spots_remaining < v_booking.guests_count then
    raise exception 'insufficient spots';
  end if;

  update public.sessions
  set
    spots_remaining = spots_remaining - v_booking.guests_count,
    status = case
      when spots_remaining - v_booking.guests_count = 0 then 'full'
      else status
    end
  where id = v_session.id;

  update public.bookings
  set
    status = 'confirmed',
    stripe_charge_id = coalesce(p_stripe_charge_id, stripe_charge_id),
    host_fee = coalesce(p_host_fee, host_fee),
    host_payout_amount = coalesce(p_host_payout_amount, host_payout_amount)
  where id = v_booking.id;

  -- Set aside the host's other open, unbooked sessions at the same time.
  -- The sessions trigger fills in held_by_session_id.
  update public.sessions s
  set status = 'held'
  from public.listings l
  where l.id = s.listing_id
    and l.host_id = v_host
    and s.id <> v_session.id
    and s.status = 'open'
    and s.starts_at < v_session.starts_at + make_interval(mins => v_session.duration_mins)
    and s.starts_at + make_interval(mins => s.duration_mins) > v_session.starts_at
    and not exists (
      select 1 from public.bookings b
      where b.session_id = s.id and b.status = 'confirmed'
    );

  return v_booking.id;
end;
$$;

revoke all on function public.confirm_paid_booking(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.confirm_paid_booking(uuid, text, integer, integer) to service_role;

-- When a session loses its last confirmed booking, reopen what it held.
-- Setting status 'open' runs the sessions trigger, which re-holds a session
-- that still clashes with another booking and marks a no-spots one full.
create or replace function public.release_host_session_holds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.bookings
    where session_id = new.session_id and status = 'confirmed'
  ) then
    return new;
  end if;

  update public.sessions
  set status = 'open'
  where held_by_session_id = new.session_id
    and status = 'held'
    and starts_at > now();

  return new;
end;
$$;

revoke all on function public.release_host_session_holds() from public, anon;
grant execute on function public.release_host_session_holds() to authenticated;

drop trigger if exists bookings_release_host_holds on public.bookings;

create trigger bookings_release_host_holds
  after update of status on public.bookings
  for each row
  when (old.status = 'confirmed' and new.status is distinct from 'confirmed')
  execute function public.release_host_session_holds();
