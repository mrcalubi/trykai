-- Listing spots are the source of truth. Open sessions can move.
--
-- set_listing_spots writes listings.max_guests and every future session's
-- spots_total in one transaction. A session that already has bookings cannot
-- shrink below those guests.
--
-- edit_open_session moves an empty session. Any pending or confirmed booking
-- raises session_has_bookings. Overlap matches add_listing_session.
--
-- Booking INSERT locks the session row, so a checkout and an edit cannot
-- both commit: they wait on the same FOR UPDATE. Checkout then re-reads
-- starts_at from the server.
--
-- Authenticated cannot UPDATE session time or capacity, or listings.max_guests.
-- Those writes go through the RPCs above, other security-definer functions,
-- or the service role. Session INSERT and add_listing_session(p_spots) stay.
-- listings still has table-level UPDATE from 00001 GRANT ALL, so a column
-- REVOKE of max_guests would be a no-op; revoke table UPDATE and re-grant
-- only the Edit listing columns.
--
-- Safe to run more than once.

create or replace function public.set_listing_spots(
  p_listing_id uuid,
  p_spots integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_session public.sessions;
  v_booked integer;
  v_pending integer;
  v_floor integer;
  v_total integer;
  v_remaining integer;
  v_updated integer := 0;
  v_held jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_spots is null or p_spots < 1 then
    raise exception 'Spots per session must be at least 1.';
  end if;

  select *
  into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'listing not found';
  end if;

  if v_listing.host_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  perform 1
  from public.sessions
  where listing_id = p_listing_id
    and starts_at > now()
    and status is distinct from 'cancelled'
  order by id
  for update;

  update public.listings
  set max_guests = p_spots
  where id = p_listing_id;

  for v_session in
    select *
    from public.sessions
    where listing_id = p_listing_id
      and starts_at > now()
      and status is distinct from 'cancelled'
    order by starts_at
  loop
    v_booked := v_session.spots_total - v_session.spots_remaining;

    select coalesce(sum(guests_count), 0)
    into v_pending
    from public.bookings
    where session_id = v_session.id
      and status = 'pending';

    v_floor := v_booked + v_pending;
    v_total := greatest(p_spots, v_floor);
    v_remaining := v_total - v_booked;

    update public.sessions
    set
      spots_total = v_total,
      spots_remaining = v_remaining,
      status = case
        when v_remaining = 0 then 'full'
        else 'open'
      end
    where id = v_session.id;

    v_updated := v_updated + 1;

    if v_total > p_spots then
      v_held := v_held || jsonb_build_array(
        jsonb_build_object(
          'session_id', v_session.id,
          'starts_at', v_session.starts_at,
          'spots_total', v_total,
          'booked', v_floor
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'updated', v_updated,
    'held', v_held
  );
end;
$$;

revoke all on function public.set_listing_spots(uuid, integer) from public, anon;
grant execute on function public.set_listing_spots(uuid, integer) to authenticated;

create or replace function public.edit_open_session(
  p_session_id uuid,
  p_starts_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions;
  v_listing public.listings;
  v_clash public.sessions;
  v_booking_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'Choose a time in the future.';
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id;

  if not found then
    raise exception 'session not found';
  end if;

  select *
  into v_listing
  from public.listings
  where id = v_session.listing_id
  for update;

  if not found then
    raise exception 'listing not found';
  end if;

  if v_listing.host_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if v_session.status = 'cancelled' then
    raise exception 'session not found';
  end if;

  select id
  into v_booking_id
  from public.bookings
  where session_id = p_session_id
    and status in ('pending', 'confirmed')
  limit 1;

  if found then
    raise exception 'session_has_bookings';
  end if;

  select *
  into v_clash
  from public.sessions
  where listing_id = v_session.listing_id
    and id is distinct from v_session.id
    and status is distinct from 'cancelled'
    and starts_at < p_starts_at + make_interval(mins => v_session.duration_mins)
    and starts_at + make_interval(mins => duration_mins) > p_starts_at
  order by starts_at
  limit 1;

  if found then
    raise exception '%', public.session_overlap_message(v_clash.starts_at, v_clash.duration_mins);
  end if;

  update public.sessions
  set starts_at = p_starts_at
  where id = p_session_id;

  return p_session_id;
end;
$$;

revoke all on function public.edit_open_session(uuid, timestamptz) from public, anon;
grant execute on function public.edit_open_session(uuid, timestamptz) to authenticated;

create or replace function public.lock_session_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
  from public.sessions
  where id = new.session_id
  for update;

  return new;
end;
$$;

revoke all on function public.lock_session_on_booking() from public, anon;
grant execute on function public.lock_session_on_booking() to authenticated;

drop trigger if exists bookings_lock_session on public.bookings;

create trigger bookings_lock_session
  before insert on public.bookings
  for each row
  execute function public.lock_session_on_booking();

-- 00009 already revoked table UPDATE on sessions from anon/authenticated.
-- Name the time and capacity columns so a later GRANT UPDATE cannot restore
-- them without a matching column grant. There is no end-time column;
-- duration_mins is the length.
revoke update (starts_at, duration_mins, spots_total, spots_remaining)
  on table public.sessions
  from public, anon, authenticated;

-- 00001 GRANT ALL still gives authenticated table-level UPDATE on listings.
-- A column REVOKE of max_guests has no effect while that remains. Revoke
-- table UPDATE, then grant only the columns Edit listing writes.
revoke update on table public.listings from public, anon, authenticated;

grant update (
  title,
  description,
  category,
  price_per_person,
  duration_mins,
  group_pricing,
  area,
  full_address,
  whats_provided,
  photo_urls
) on table public.listings to authenticated;

-- Hosting delete is delete_listing (security definer). Clients have no
-- listings DELETE path. INSERT stays for Create listing.
revoke delete on table public.listings from public, anon, authenticated;
