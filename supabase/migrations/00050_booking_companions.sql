-- Who's coming: friends take a seat on a group booking (DECISIONS.md,
-- 3 November 2026; canvas page "Who's coming").
--
-- The booker sends one link per booking. A friend signs in and takes a seat.
-- A companion gets a read-only booking page (time, place, directions, the
-- host's day-of number; never prices), the session on their profile, and a
-- host review of their own. Only the booker pays, moves, cancels, reports a
-- problem or reviews the host.
--
-- Additive only: new tables and RPCs, and existing reveal functions widened
-- to companions. Apply on staging, then production, BEFORE merging the
-- release that calls these functions. Requires 00048 (two-way reviews).
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Seats and join codes. No client grants: everything goes through RPCs.
-- ---------------------------------------------------------------------------

create table if not exists public.booking_guests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  constraint booking_guests_one_seat_per_person unique (booking_id, user_id)
);

create index if not exists booking_guests_user_id_idx on public.booking_guests (user_id);

alter table public.booking_guests enable row level security;
revoke all on table public.booking_guests from public, anon, authenticated;
grant select, insert, delete on table public.booking_guests to service_role;

-- Separate table so the code is never readable through a bookings SELECT
-- (hosts can read their sessions' bookings).
create table if not exists public.booking_join_codes (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint booking_join_codes_code_shape check (code ~ '^[a-f0-9]{20}$')
);

alter table public.booking_join_codes enable row level security;
revoke all on table public.booking_join_codes from public, anon, authenticated;
grant select on table public.booking_join_codes to service_role;

create or replace function public.new_join_code()
returns text
language sql
volatile
set search_path = public
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
$$;

revoke all on function public.new_join_code() from public, anon, authenticated;

-- One place for "is this person a companion on a confirmed booking".
create or replace function public.is_booking_companion(p_booking_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.booking_guests bg
    where bg.booking_id = p_booking_id
      and bg.user_id = p_user_id
  );
$$;

revoke all on function public.is_booking_companion(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Booker: get (or make) the link; see and remove companions.
-- ---------------------------------------------------------------------------

create or replace function public.booking_join_link(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_session_end timestamptz;
  v_code text;
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if v_booking.id is null or v_uid is null or v_booking.guest_id is distinct from v_uid then
    raise exception 'not_allowed';
  end if;
  if v_booking.status is distinct from 'confirmed' or coalesce(v_booking.guests_count, 1) < 2 then
    raise exception 'not_allowed';
  end if;

  select s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute')
  into v_session_end
  from public.sessions s
  join public.listings l on l.id = s.listing_id
  where s.id = v_booking.session_id;
  if now() >= v_session_end + interval '7 days' then
    raise exception 'closed';
  end if;

  select c.code into v_code from public.booking_join_codes c where c.booking_id = p_booking_id;
  if v_code is null then
    v_code := public.new_join_code();
    insert into public.booking_join_codes (booking_id, code) values (p_booking_id, v_code);
  end if;
  return v_code;
end;
$$;

revoke all on function public.booking_join_link(uuid) from public, anon;
grant execute on function public.booking_join_link(uuid) to authenticated;

-- Booker, a companion, or the listing's host. Names and avatars only.
create or replace function public.booking_companions(p_booking_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select bg.user_id, u.display_name, u.avatar_url, bg.joined_at
  from public.booking_guests bg
  join public.bookings b on b.id = bg.booking_id
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  left join public.users u on u.id = bg.user_id
  where bg.booking_id = p_booking_id
    and auth.uid() is not null
    and (
      b.guest_id = auth.uid()
      or l.host_id = auth.uid()
      or public.is_booking_companion(p_booking_id, auth.uid())
    )
  order by bg.joined_at;
$$;

revoke all on function public.booking_companions(uuid) from public, anon;
grant execute on function public.booking_companions(uuid) to authenticated;

-- Booker removes a friend before the session starts. The link changes, so a
-- forwarded link stops working.
create or replace function public.remove_booking_companion(p_booking_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_guest_id uuid;
  v_starts_at timestamptz;
begin
  select b.guest_id, s.starts_at
  into v_guest_id, v_starts_at
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  where b.id = p_booking_id
  for update of b;

  if v_uid is null or v_guest_id is distinct from v_uid then
    raise exception 'not_allowed';
  end if;
  if now() >= v_starts_at then
    raise exception 'started';
  end if;

  delete from public.booking_guests where booking_id = p_booking_id and user_id = p_user_id;
  update public.booking_join_codes set code = public.new_join_code(), created_at = now()
  where booking_id = p_booking_id;
end;
$$;

revoke all on function public.remove_booking_companion(uuid, uuid) from public, anon;
grant execute on function public.remove_booking_companion(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Friend: preview the link, take a seat, leave.
-- ---------------------------------------------------------------------------

-- Public preview. No address, no prices, no booking id.
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
  area := v_listing.area;
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

create or replace function public.claim_booking_seat(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_end timestamptz;
  v_host_id uuid;
  v_seats_taken integer;
begin
  if v_uid is null then
    raise exception 'not_allowed';
  end if;

  select b.* into v_booking
  from public.booking_join_codes c
  join public.bookings b on b.id = c.booking_id
  where c.code = lower(btrim(coalesce(p_code, '')))
  for update of b;

  if v_booking.id is null then
    raise exception 'not_found';
  end if;
  if v_booking.status is distinct from 'confirmed' then
    raise exception 'cancelled';
  end if;

  select s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute'), l.host_id
  into v_end, v_host_id
  from public.sessions s
  join public.listings l on l.id = s.listing_id
  where s.id = v_booking.session_id;

  if now() >= v_end + interval '7 days' then
    raise exception 'closed';
  end if;
  if v_uid = v_booking.guest_id then
    raise exception 'mine';
  end if;
  if v_uid = v_host_id then
    raise exception 'host';
  end if;
  if public.is_booking_companion(v_booking.id, v_uid) or exists (
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
  ) then
    raise exception 'already';
  end if;

  select count(*) into v_seats_taken from public.booking_guests bg where bg.booking_id = v_booking.id;
  if v_seats_taken >= greatest(coalesce(v_booking.guests_count, 1) - 1, 0) then
    raise exception 'full';
  end if;

  insert into public.booking_guests (booking_id, user_id) values (v_booking.id, v_uid);
  return v_booking.id;
end;
$$;

revoke all on function public.claim_booking_seat(text) from public, anon;
grant execute on function public.claim_booking_seat(text) to authenticated;

create or replace function public.leave_booking_seat(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_allowed';
  end if;
  select s.starts_at into v_starts_at
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  where b.id = p_booking_id;
  if v_starts_at is not null and now() >= v_starts_at then
    raise exception 'started';
  end if;
  delete from public.booking_guests where booking_id = p_booking_id and user_id = auth.uid();
end;
$$;

revoke all on function public.leave_booking_seat(uuid) from public, anon;
grant execute on function public.leave_booking_seat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. A companion's view of the booking. Same shape as the booking page's
--    select, minus every money field.
-- ---------------------------------------------------------------------------

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

-- The companion's Bookings list: same fields as the guest list, no money.
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

-- ---------------------------------------------------------------------------
-- 5. Address, directions and day-of number: confirmed companions too.
--    Same bodies as 00025 / 00046 plus the companion branch.
-- ---------------------------------------------------------------------------

create or replace function public.listing_address(listing_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_address text;
  v_host_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select l.full_address, l.host_id
  into v_address, v_host_id
  from public.listings l
  where l.id = listing_address.listing_id;

  if not found then
    return null;
  end if;

  if auth.uid() = v_host_id then
    return v_address;
  end if;

  if exists (
    select 1
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.status = 'confirmed'
      and s.listing_id = listing_address.listing_id
      and (b.guest_id = auth.uid() or public.is_booking_companion(b.id, auth.uid()))
  ) then
    return v_address;
  end if;

  return null;
end;
$$;

revoke all on function public.listing_address(uuid) from public, anon;
grant execute on function public.listing_address(uuid) to authenticated;

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
    where b.status = 'confirmed'
      and s.listing_id = listing_arrival_instructions.listing_id
      and (b.guest_id = auth.uid() or public.is_booking_companion(b.id, auth.uid()))
  ) then
    return v_instructions;
  end if;

  return null;
end;
$$;

revoke all on function public.listing_arrival_instructions(uuid) from public, anon;
grant execute on function public.listing_arrival_instructions(uuid) to authenticated;

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
    and (b.guest_id = auth.uid() or public.is_booking_companion(b.id, auth.uid()))
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

-- ---------------------------------------------------------------------------
-- 6. Host side: names per session, and reviewing companions.
-- ---------------------------------------------------------------------------

-- Confirmed bookers and claimed companions on the calling host's sessions.
create or replace function public.host_session_guests(p_session_ids uuid[])
returns table (
  session_id uuid,
  booking_id uuid,
  user_id uuid,
  display_name text,
  is_companion boolean,
  guests_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select b.session_id, b.id, b.guest_id, u.display_name, false, coalesce(b.guests_count, 1)
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  left join public.users u on u.id = b.guest_id
  where b.session_id = any(p_session_ids)
    and b.status = 'confirmed'
    and l.host_id = auth.uid()
  union all
  select b.session_id, b.id, bg.user_id, u.display_name, true, null::integer
  from public.booking_guests bg
  join public.bookings b on b.id = bg.booking_id
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  left join public.users u on u.id = bg.user_id
  where b.session_id = any(p_session_ids)
    and b.status = 'confirmed'
    and l.host_id = auth.uid();
$$;

revoke all on function public.host_session_guests(uuid[]) from public, anon;
grant execute on function public.host_session_guests(uuid[]) to authenticated;

-- 00048 shape plus booked_by (null for the booker; the booker's name for a
-- companion). Return type changes, so drop and recreate; grants as 00048.
drop function if exists public.host_reviews_due();

create function public.host_reviews_due()
returns table (
  booking_id uuid,
  guest_id uuid,
  guest_display_name text,
  guest_avatar_url text,
  listing_title text,
  starts_at timestamptz,
  deadline timestamptz,
  host_reviewed boolean,
  guest_reviewed boolean,
  booked_by text
)
language sql
stable
security definer
set search_path = public
as $$
  with due as (
    select
      b.id as booking_id,
      b.guest_id as booker_id,
      l.host_id,
      l.title as listing_title,
      s.starts_at,
      s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute') as session_end,
      b.created_at
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    join public.listings l on l.id = s.listing_id
    where l.host_id = auth.uid()
      and b.status = 'confirmed'
  ),
  people as (
    select d.*, d.booker_id as person_id, null::text as booked_by, 0 as person_order, d.created_at as joined
    from due d
    union all
    select d.*, bg.user_id, bu.display_name, 1, bg.joined_at
    from due d
    join public.booking_guests bg on bg.booking_id = d.booking_id
    left join public.users bu on bu.id = d.booker_id
  )
  select
    p.booking_id,
    p.person_id as guest_id,
    u.display_name as guest_display_name,
    u.avatar_url as guest_avatar_url,
    p.listing_title,
    p.starts_at,
    p.session_end + interval '7 days' as deadline,
    exists (
      select 1 from public.reviews hr
      where hr.booking_id = p.booking_id
        and hr.role = 'host'
        and hr.reviewee_id = p.person_id
        and hr.reviewer_id = auth.uid()
    ) as host_reviewed,
    -- Only the booker reviews the host, so this is about the booker's review.
    p.person_order = 0 and exists (
      select 1 from public.reviews gr
      where gr.booking_id = p.booking_id
        and gr.role = 'guest'
        and gr.reviewee_id = p.host_id
    ) as guest_reviewed,
    p.booked_by
  from people p
  left join public.users u on u.id = p.person_id
  where now() > p.session_end
    and now() < p.session_end + interval '7 days'
  order by p.starts_at desc, p.created_at desc, p.person_order, p.joined;
$$;

comment on function public.host_reviews_due() is
  'Guests (bookers and claimed companions) on the calling host''s confirmed bookings whose session ended less than 7 days ago.';

revoke all on function public.host_reviews_due() from public, anon;
grant execute on function public.host_reviews_due() to authenticated;

-- post_review (00048) with one change: a host may also review a companion
-- on the booking. Everything else is unchanged.
create or replace function public.post_review(
  p_booking_id uuid,
  p_reviewee_id uuid,
  p_rating integer,
  p_comment text,
  p_photo_paths text[],
  p_private_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_guest_id uuid;
  v_host_id uuid;
  v_status text;
  v_session_end timestamptz;
  v_role text;
  v_comment text;
  v_photos text[] := coalesce(p_photo_paths, '{}');
  v_note text;
  v_review_id uuid;
  v_revealed boolean;
  v_reveal_after timestamptz;
begin
  if v_uid is null then
    raise exception 'not_allowed';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'not_allowed';
  end if;

  select b.guest_id, b.status, l.host_id,
    s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute')
  into v_guest_id, v_status, v_host_id, v_session_end
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  where b.id = p_booking_id;

  if v_guest_id is null or v_host_id is null then
    raise exception 'not_allowed';
  end if;

  if v_status is distinct from 'confirmed' then
    raise exception 'not_allowed';
  end if;

  if now() <= v_session_end then
    raise exception 'not_allowed';
  end if;

  if now() >= v_session_end + interval '7 days' then
    raise exception 'review_window_closed';
  end if;

  if v_uid = v_guest_id and p_reviewee_id = v_host_id then
    v_role := 'guest';
    v_comment := nullif(btrim(coalesce(p_comment, '')), '');
  elsif v_uid = v_host_id
    and (p_reviewee_id = v_guest_id or public.is_booking_companion(p_booking_id, p_reviewee_id)) then
    v_role := 'host';
    v_comment := btrim(coalesce(p_comment, ''));
    if char_length(v_comment) < 10 or char_length(v_comment) > 1000 then
      raise exception 'not_allowed';
    end if;
    if cardinality(v_photos) <> 0 then
      raise exception 'not_allowed';
    end if;
  else
    raise exception 'not_allowed';
  end if;

  if exists (
    select 1
    from public.reviews r
    where r.booking_id = p_booking_id
      and r.reviewer_id = v_uid
      and r.role = v_role
      and (v_role = 'guest' or r.reviewee_id = p_reviewee_id)
  ) then
    raise exception 'already_reviewed';
  end if;

  insert into public.reviews (
    booking_id, reviewer_id, reviewee_id, rating, comment, role, photo_paths
  ) values (
    p_booking_id, v_uid, p_reviewee_id, p_rating, v_comment, v_role, v_photos
  )
  returning id into v_review_id;

  v_note := nullif(btrim(coalesce(p_private_note, '')), '');
  if v_note is not null then
    if char_length(v_note) > 2000 then
      raise exception 'not_allowed';
    end if;
    insert into public.review_notes (review_id, booking_id, author_id, note)
    values (v_review_id, p_booking_id, v_uid, v_note);
  end if;

  select r.reveal_after, public.review_is_public(r)
  into v_reveal_after, v_revealed
  from public.reviews r
  where r.id = v_review_id;

  return jsonb_build_object(
    'review_id', v_review_id,
    'revealed', coalesce(v_revealed, false),
    'reveal_after', v_reveal_after
  );
exception
  when unique_violation then
    raise exception 'already_reviewed';
end;
$$;

revoke all on function public.post_review(uuid, uuid, integer, text, text[], text) from public, anon;
grant execute on function public.post_review(uuid, uuid, integer, text, text[], text) to authenticated;

-- Reveal (00048) widened: once the booker's review of the host and the host's
-- review of the booker both exist, every review on the booking goes live,
-- including host reviews of companions, now or later.
create or replace function public.reviews_reveal_when_both()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_host_id uuid;
begin
  perform 1 from public.bookings where id = new.booking_id for update;

  select b.guest_id, l.host_id
  into v_guest_id, v_host_id
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  where b.id = new.booking_id;

  if v_guest_id is null or v_host_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.reviews r
    where r.booking_id = new.booking_id and r.role = 'guest' and r.reviewee_id = v_host_id
  ) and exists (
    select 1 from public.reviews r
    where r.booking_id = new.booking_id and r.role = 'host' and r.reviewee_id = v_guest_id
  ) then
    update public.reviews
    set revealed_at = now()
    where booking_id = new.booking_id
      and revealed_at is null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Profile stats: sessions a companion attended count like the booker's.
--    Same return type as 00048, so create or replace keeps the grants.
-- ---------------------------------------------------------------------------

create or replace function public.my_profile_stats()
returns table (
  guests_hosted integer,
  repeat_guests integer,
  sessions_attended integer,
  categories_tried integer,
  reviews_written integer,
  joined_at timestamptz,
  host_reviews_received integer,
  host_five_star_received integer,
  guests_reviewed integer
)
language sql
stable
security definer
set search_path = public
as $$
  with hosted as (
    select b.guest_id, b.session_id, coalesce(b.guests_count, 1) as guests
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    join public.listings l on l.id = s.listing_id
    where l.host_id = auth.uid()
      and b.status = 'confirmed'
      and s.starts_at + make_interval(mins => coalesce(s.duration_mins, 60)) < now()
  ),
  per_guest as (
    select h.guest_id, count(distinct h.session_id) as sessions
    from hosted h
    group by h.guest_id
  ),
  attended as (
    select b.session_id, l.category
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    join public.listings l on l.id = s.listing_id
    where b.status = 'confirmed'
      and s.starts_at + make_interval(mins => coalesce(s.duration_mins, 60)) < now()
      and (
        b.guest_id = auth.uid()
        or exists (
          select 1 from public.booking_guests bg
          where bg.booking_id = b.id and bg.user_id = auth.uid()
        )
      )
  )
  select
    (select coalesce(sum(h.guests), 0)::integer from hosted h),
    (select count(*)::integer from per_guest p where p.sessions >= 2),
    (select count(distinct a.session_id)::integer from attended a),
    (select count(distinct a.category)::integer from attended a where a.category is not null),
    (
      select count(*)::integer
      from public.reviews r
      where r.reviewer_id = auth.uid()
        and r.role = 'guest'
    ),
    (select u.created_at from public.users u where u.id = auth.uid()),
    (
      select count(*)::integer
      from public.reviews r
      where r.reviewee_id = auth.uid()
        and r.role = 'host'
        and public.review_is_public(r)
    ),
    (
      select count(*)::integer
      from public.reviews r
      where r.reviewee_id = auth.uid()
        and r.role = 'host'
        and r.rating = 5
        and public.review_is_public(r)
    ),
    (
      select count(*)::integer
      from public.reviews r
      where r.reviewer_id = auth.uid()
        and r.role = 'host'
    )
  where auth.uid() is not null;
$$;

revoke all on function public.my_profile_stats() from public, anon;
grant execute on function public.my_profile_stats() to authenticated;
