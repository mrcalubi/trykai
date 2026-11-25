-- Listing locations, guest side (DECISIONS.md, 25 November 2026).
--
-- Friends who take a seat on a booking (00050) see where it is the same way
-- the booker does: at the session's own location, not the listing's first.
--
--   * join_preview: `area` is the session location's area (public, never the
--     address). Before 00059's backfill it falls back to the listing's area.
--   * companion_booking and my_companion_bookings: the session object carries
--     location_id, so the booking page and the Bookings list can name the place
--     and pick its address from listing_location_details.
--
-- Same signatures, bodies as 00050 plus those lines. Needs 00059.
-- Safe to run more than once.

create or replace function public.join_preview(p_code text)
returns table (
  state text,             -- 'ok' | 'full' | 'cancelled' | 'closed' | 'already' | 'mine' | 'host' | 'not_found'
  booker_display_name text,
  listing_id uuid,
  listing_title text,
  listing_photo text,
  area text,
  host_display_name text,
  starts_at timestamptz,
  duration_mins integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_listing public.listings;
  v_seats_taken integer;
  v_uid uuid := auth.uid();
  v_end timestamptz;
begin
  select b.* into v_booking
  from public.booking_join_codes c
  join public.bookings b on b.id = c.booking_id
  where c.code = lower(btrim(coalesce(p_code, '')));

  if v_booking.id is null then
    state := 'not_found';
    return next;
    return;
  end if;

  select s.* into v_session from public.sessions s where s.id = v_booking.session_id;
  select l.* into v_listing from public.listings l where l.id = v_session.listing_id;
  select count(*) into v_seats_taken from public.booking_guests bg where bg.booking_id = v_booking.id;
  v_end := v_session.starts_at + (coalesce(v_session.duration_mins, v_listing.duration_mins, 120) * interval '1 minute');

  select u.display_name into booker_display_name from public.users u where u.id = v_booking.guest_id;
  select u.display_name into host_display_name from public.users u where u.id = v_listing.host_id;
  listing_id := v_listing.id;
  listing_title := v_listing.title;
  listing_photo := (v_listing.photo_urls)[1];
  area := coalesce(
    (select loc.area from public.listing_locations loc where loc.id = v_session.location_id),
    v_listing.area
  );
  starts_at := v_session.starts_at;
  duration_mins := coalesce(v_session.duration_mins, v_listing.duration_mins);

  if v_booking.status is distinct from 'confirmed' then
    state := 'cancelled';
  elsif now() >= v_end + interval '7 days' then
    state := 'closed';
  elsif v_uid is not null and v_uid = v_booking.guest_id then
    state := 'mine';
  elsif v_uid is not null and v_uid = v_listing.host_id then
    state := 'host';
  elsif v_uid is not null and public.is_booking_companion(v_booking.id, v_uid) then
    state := 'already';
  elsif v_uid is not null and (exists (
    select 1 from public.bookings ob
    where ob.session_id = v_booking.session_id
      and ob.guest_id = v_uid
      and ob.status in ('pending', 'confirmed')
  ) or exists (
    select 1
    from public.booking_guests og
    join public.bookings ob on ob.id = og.booking_id
    where og.user_id = v_uid
      and ob.session_id = v_booking.session_id
      and ob.status = 'confirmed'
  )) then
    state := 'already';
  elsif v_seats_taken >= greatest(coalesce(v_booking.guests_count, 1) - 1, 0) then
    state := 'full';
  else
    state := 'ok';
  end if;
  return next;
end;
$$;

revoke all on function public.join_preview(text) from public;
grant execute on function public.join_preview(text) to anon, authenticated;

create or replace function public.companion_booking(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', b.id,
    'status', b.status,
    'guests_count', b.guests_count,
    'session_id', b.session_id,
    'created_at', b.created_at,
    'is_companion', true,
    'booker_display_name', bu.display_name,
    'sessions', jsonb_build_object(
      'id', s.id,
      'starts_at', s.starts_at,
      'duration_mins', s.duration_mins,
      'location_id', s.location_id,
      'listings', jsonb_build_object(
        'id', l.id,
        'title', l.title,
        'photo_urls', l.photo_urls,
        'whats_provided', l.whats_provided,
        'what_to_bring', l.what_to_bring,
        'duration_mins', l.duration_mins,
        'host_id', l.host_id,
        'area', l.area,
        'users', jsonb_build_object(
          'display_name', hu.display_name,
          'avatar_url', hu.avatar_url,
          'bio', hu.bio,
          'is_id_verified', hu.is_id_verified
        )
      )
    )
  )
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  left join public.users bu on bu.id = b.guest_id
  left join public.users hu on hu.id = l.host_id
  where b.id = p_booking_id
    and auth.uid() is not null
    and public.is_booking_companion(p_booking_id, auth.uid());
$$;

revoke all on function public.companion_booking(uuid) from public, anon;
grant execute on function public.companion_booking(uuid) to authenticated;

create or replace function public.my_companion_bookings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(c.item order by c.joined_at desc), '[]'::jsonb)
  from (
    select bg.joined_at, jsonb_build_object(
      'id', b.id,
      'status', b.status,
      'session_id', b.session_id,
      'guests_count', b.guests_count,
      'is_companion', true,
      'booker_display_name', bu.display_name,
      'sessions', jsonb_build_object(
        'starts_at', s.starts_at,
        'duration_mins', s.duration_mins,
        'location_id', s.location_id,
        'listings', jsonb_build_object(
          'id', l.id,
          'title', l.title,
          'host_id', l.host_id,
          'duration_mins', l.duration_mins
        )
      )
    ) as item
    from public.booking_guests bg
    join public.bookings b on b.id = bg.booking_id
    join public.sessions s on s.id = b.session_id
    join public.listings l on l.id = s.listing_id
    left join public.users bu on bu.id = b.guest_id
    where bg.user_id = auth.uid()
  ) c;
$$;

revoke all on function public.my_companion_bookings() from public, anon;
grant execute on function public.my_companion_bookings() to authenticated;
