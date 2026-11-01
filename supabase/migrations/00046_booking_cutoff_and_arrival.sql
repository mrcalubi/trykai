-- Booking cutoff, How to find me, day-of host number, and the contact RPC.
-- Safe to run more than once.
--
-- booking_cutoff_hours is public like price_per_person. Changing it does not
-- send an approved listing back for review (guard_listing_review only compares
-- the content tuple from 00038).
-- arrival_instructions is private like full_address: no SELECT grant; host or
-- confirmed guest read it through listing_arrival_instructions.
-- day_of_phone / share_day_of_phone follow the 17 Oct PII lock: no client
-- SELECT; the owner reads them through my_account.

alter table public.listings
  add column if not exists booking_cutoff_hours smallint not null default 3;

alter table public.listings
  drop constraint if exists listings_booking_cutoff_hours;
alter table public.listings
  add constraint listings_booking_cutoff_hours
  check (booking_cutoff_hours in (3, 6, 12, 24, 48));

comment on column public.listings.booking_cutoff_hours is
  'Hours before starts_at when guests can no longer start a booking. 3, 6, 12, 24 or 48.';

alter table public.listings
  add column if not exists arrival_instructions text;

alter table public.listings
  drop constraint if exists listings_arrival_instructions_len;
alter table public.listings
  add constraint listings_arrival_instructions_len
  check (arrival_instructions is null or char_length(arrival_instructions) <= 200);

comment on column public.listings.arrival_instructions is
  'How to find the host. Private like full_address. Null or ≤200 characters.';

grant select (booking_cutoff_hours) on table public.listings to anon, authenticated;
grant insert on table public.listings to authenticated;
grant update (
  title,
  description,
  category,
  price_per_person,
  duration_mins,
  group_pricing,
  area,
  full_address,
  arrival_instructions,
  booking_cutoff_hours,
  whats_provided,
  what_to_bring,
  photo_urls
) on table public.listings to authenticated;

revoke select (arrival_instructions) on table public.listings from public, anon, authenticated;

create or replace function public.listing_arrival_instructions(listing_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instructions text;
  v_host_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select l.arrival_instructions, l.host_id
  into v_instructions, v_host_id
  from public.listings l
  where l.id = listing_arrival_instructions.listing_id;

  if not found then
    return null;
  end if;

  if auth.uid() = v_host_id then
    return v_instructions;
  end if;

  if exists (
    select 1
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.guest_id = auth.uid()
      and b.status = 'confirmed'
      and s.listing_id = listing_arrival_instructions.listing_id
  ) then
    return v_instructions;
  end if;

  return null;
end;
$$;

revoke all on function public.listing_arrival_instructions(uuid) from public, anon;
grant execute on function public.listing_arrival_instructions(uuid) to authenticated;

alter table public.users
  add column if not exists day_of_phone text;

alter table public.users
  add column if not exists share_day_of_phone boolean not null default false;

alter table public.users
  drop constraint if exists users_day_of_phone_sg;
alter table public.users
  add constraint users_day_of_phone_sg
  check (day_of_phone is null or day_of_phone ~ '^\+65[3689][0-9]{7}$');

comment on column public.users.day_of_phone is
  'Optional Singapore number for day-of guest contact, stored as +65XXXXXXXX.';

comment on column public.users.share_day_of_phone is
  'When true, confirmed guests can read day_of_phone through booking_host_contact in the 24h window.';

revoke select (day_of_phone, share_day_of_phone) on table public.users from public, anon, authenticated;
grant update (day_of_phone, share_day_of_phone) on table public.users to authenticated;

drop function if exists public.my_account();
create function public.my_account()
returns table (
  email text,
  full_name text,
  phone text,
  display_name text,
  bio text,
  avatar_url text,
  is_host boolean,
  verification_status text,
  stripe_payouts_enabled boolean,
  host_strikes integer,
  day_of_phone text,
  share_day_of_phone boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select u.email,
         u.full_name,
         u.phone,
         u.display_name,
         u.bio,
         u.avatar_url,
         u.is_host,
         u.verification_status,
         u.stripe_payouts_enabled,
         public.host_active_strike_count(u.id),
         u.day_of_phone,
         u.share_day_of_phone
  from public.users u
  where u.id = auth.uid();
$$;

revoke all on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

create or replace function public.booking_host_contact(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if auth.uid() is null then
    return null;
  end if;

  select u.day_of_phone
  into v_phone
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  join public.users u on u.id = l.host_id
  where b.id = p_booking_id
    and b.guest_id = auth.uid()
    and b.status = 'confirmed'
    and u.share_day_of_phone is true
    and u.day_of_phone is not null
    and now() >= s.starts_at - interval '24 hours'
    and now() <= s.starts_at + make_interval(mins => coalesce(nullif(s.duration_mins, 0), 120));

  return v_phone;
end;
$$;

revoke all on function public.booking_host_contact(uuid) from public, anon;
grant execute on function public.booking_host_contact(uuid) to authenticated;

-- Same body as 00044, plus the new-session booking cutoff.
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
  v_cutoff smallint;
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

  select coalesce(l.booking_cutoff_hours, 3)
  into v_cutoff
  from public.listings l
  where l.id = v_new.listing_id;

  if v_new.starts_at <= now() + make_interval(hours => coalesce(v_cutoff, 3)) then
    raise exception 'bookings closed';
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
