-- One session per time, with the listing's spots (bug fix, 16 November 2026).
--
-- add_listing_session added the new spots to a session of the same class at
-- the same time, so adding the same date twice turned a 4-spot listing into an
-- 8-spot session. Spots per session live on the listing (DECISIONS.md, 17
-- October 2026), so a repeat time is now refused: 'That time is already on.'
-- Another class at that time is still refused as before.
--
-- Then every future open or full session that holds more spots than its
-- listing allows goes back to the listing's spots, never below the guests
-- already booked or paying (the same floor as set_listing_spots, 00024).
--
-- Same signature and grants as 00056. Safe to run more than once.

create or replace function public.add_listing_session(
  p_listing_id uuid,
  p_starts_at timestamptz,
  p_spots integer,
  p_type_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_existing public.sessions;
  v_total integer;
  v_remaining integer;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_spots is null or p_spots < 1 then
    raise exception 'Spots total must be at least 1.';
  end if;

  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'Choose a time in the future.';
  end if;

  if not public.can_create_listing() then
    raise exception 'not allowed';
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

  select *
  into v_existing
  from public.sessions
  where listing_id = p_listing_id
    and starts_at = p_starts_at
    and duration_mins = v_listing.duration_mins
    and status in ('open', 'full')
  order by created_at
  limit 1
  for update;

  if found then
    if v_existing.type_id is distinct from p_type_id then
      raise exception 'That time already has a session of another type.';
    end if;
    -- Spots come from the listing. A second add at the same time used to
    -- stack them (4 + 4 = 8); now it is refused and the session stays as is.
    raise exception 'That time is already on.';
  end if;

  insert into public.sessions (
    listing_id,
    starts_at,
    duration_mins,
    spots_total,
    spots_remaining,
    status,
    type_id
  )
  values (
    p_listing_id,
    p_starts_at,
    v_listing.duration_mins,
    p_spots,
    p_spots,
    'open',
    p_type_id
  )
  returning id
  into v_id;

  return jsonb_build_object(
    'session_id', v_id,
    'action', 'created',
    'spots_added', p_spots,
    'spots_total', p_spots,
    'spots_remaining', p_spots,
    'starts_at', p_starts_at
  );
end;
$$;

revoke all on function public.add_listing_session(uuid, timestamptz, integer, uuid) from public, anon;
grant execute on function public.add_listing_session(uuid, timestamptz, integer, uuid) to authenticated;

-- Sessions that were stacked: back to the listing's spots.
do $$
declare
  v_session record;
  v_pending integer;
  v_booked integer;
  v_total integer;
begin
  for v_session in
    select s.id, s.spots_total, s.spots_remaining, l.max_guests
    from public.sessions s
    join public.listings l on l.id = s.listing_id
    where s.starts_at > now()
      and s.status in ('open', 'full')
      and l.max_guests is not null
      and s.spots_total > l.max_guests
    for update of s
  loop
    v_booked := v_session.spots_total - v_session.spots_remaining;
    select coalesce(sum(guests_count), 0)
    into v_pending
    from public.bookings
    where session_id = v_session.id
      and status = 'pending';
    v_total := greatest(v_session.max_guests, v_booked + v_pending);
    update public.sessions
    set
      spots_total = v_total,
      spots_remaining = v_total - v_booked,
      status = case when v_total - v_booked = 0 then 'full' else 'open' end
    where id = v_session.id;
  end loop;
end;
$$;
