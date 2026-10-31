-- Guest reschedule: once per booking, same 48 hour cutoff, frozen price.
-- Safe to run more than once.

alter table public.bookings
  add column if not exists rescheduled_at timestamptz;

alter table public.bookings
  add column if not exists rescheduled_from_session_id uuid references public.sessions(id);

comment on column public.bookings.rescheduled_at is
  'Set when the guest moved this booking. Null means it has never been moved.';

comment on column public.bookings.rescheduled_from_session_id is
  'The session this booking left. The price and payout amounts stay as charged.';

grant select (rescheduled_at, rescheduled_from_session_id) on table public.bookings to authenticated;

create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_new_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_old public.sessions;
  v_new public.sessions;
  v_host uuid;
  v_first uuid;
  v_second uuid;
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

  if v_booking.status is distinct from 'confirmed' then
    raise exception 'session not available';
  end if;

  if v_booking.rescheduled_at is not null then
    raise exception 'already rescheduled';
  end if;

  if p_new_session_id is null or p_new_session_id is not distinct from v_booking.session_id then
    raise exception 'session not available';
  end if;

  select l.host_id
  into v_host
  from public.sessions s
  join public.listings l on l.id = s.listing_id
  where s.id = v_booking.session_id;

  if v_host is not null then
    perform pg_advisory_xact_lock(hashtextextended('trykai_host:' || v_host::text, 0));
  end if;

  -- Lock both session rows in id order so two moves cannot deadlock.
  if v_booking.session_id < p_new_session_id then
    v_first := v_booking.session_id;
    v_second := p_new_session_id;
  else
    v_first := p_new_session_id;
    v_second := v_booking.session_id;
  end if;

  if v_first = v_booking.session_id then
    select * into v_old from public.sessions where id = v_first for update;
    if not found then
      raise exception 'session not available';
    end if;
    select * into v_new from public.sessions where id = v_second for update;
    if not found then
      raise exception 'session not available';
    end if;
  else
    select * into v_new from public.sessions where id = v_first for update;
    if not found then
      raise exception 'session not available';
    end if;
    select * into v_old from public.sessions where id = v_second for update;
    if not found then
      raise exception 'session not available';
    end if;
  end if;

  if v_old.starts_at <= now() + interval '48 hours' then
    raise exception 'too late to reschedule';
  end if;

  if v_new.listing_id is distinct from v_old.listing_id
     or v_new.status is distinct from 'open'
     or v_new.starts_at <= now() then
    raise exception 'session not available';
  end if;

  if public.host_booked_overlap(v_host, v_new.id, v_new.starts_at, v_new.duration_mins) is not null then
    raise exception 'session not available';
  end if;

  if v_new.spots_remaining < v_booking.guests_count then
    raise exception 'insufficient spots';
  end if;

  if exists (
    select 1
    from public.booking_addons ba
    join public.listing_addons la on la.id = ba.addon_id
    where ba.booking_id = v_booking.id
      and la.session_limit is not null
      and (
        coalesce((
          select sum(ba2.quantity)
          from public.booking_addons ba2
          join public.bookings b2 on b2.id = ba2.booking_id
          where b2.session_id = v_new.id
            and b2.status = 'confirmed'
            and ba2.addon_id = ba.addon_id
        ), 0) + ba.quantity
      ) > la.session_limit
  ) then
    raise exception 'insufficient add-ons';
  end if;

  if v_booking.payment_rail = 'paynow'
     and v_new.starts_at > v_booking.created_at + interval '80 days' then
    raise exception 'paynow window';
  end if;

  -- Return the spots to the old session (reopen it if it was full).
  update public.sessions
  set
    spots_remaining = spots_remaining + v_booking.guests_count,
    status = case
      when status = 'full' then 'open'
      else status
    end
  where id = v_old.id;

  update public.sessions
  set
    spots_remaining = spots_remaining - v_booking.guests_count,
    status = case
      when spots_remaining - v_booking.guests_count = 0 then 'full'
      else status
    end
  where id = v_new.id;

  update public.bookings
  set
    session_id = v_new.id,
    rescheduled_at = now(),
    rescheduled_from_session_id = v_old.id,
    guest_reminder_sent_at = null
  where id = v_booking.id;

  update public.sessions
  set host_reminder_sent_at = null
  where id in (v_old.id, v_new.id);

  -- Same hold-release as the bookings status trigger, for a session_id move
  -- that does not change status.
  if not exists (
    select 1 from public.bookings
    where session_id = v_old.id and status = 'confirmed'
  ) then
    update public.sessions
    set status = 'open'
    where held_by_session_id = v_old.id
      and status = 'held'
      and starts_at > now();
  end if;

  update public.sessions s
  set status = 'held'
  from public.listings l
  where l.id = s.listing_id
    and l.host_id = v_host
    and s.id <> v_new.id
    and s.status = 'open'
    and s.starts_at < v_new.starts_at + make_interval(mins => v_new.duration_mins)
    and s.starts_at + make_interval(mins => s.duration_mins) > v_new.starts_at
    and not exists (
      select 1 from public.bookings b
      where b.session_id = s.id and b.status = 'confirmed'
    );

  return v_booking.id;
end;
$$;

revoke all on function public.reschedule_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reschedule_booking(uuid, uuid) to service_role;
