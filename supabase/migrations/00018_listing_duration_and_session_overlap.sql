-- Session length lives on the listing. Each session still stores duration_mins,
-- because cancellation, reviews, and the booking card read that row, and a
-- later edit of the listing must not rewrite a session guests already booked.
--
-- add_listing_session is the host path. The same start time and length as an
-- open or full session adds spots to that row. Any other overlap is refused.
-- Back-to-back sessions are allowed: a session occupies [starts_at, starts_at
-- + duration). Cancelled rows do not count.
--
-- Clients can still INSERT sessions (00009). The before-insert trigger is what
-- stops a request that skips the function from creating an overlap. Existing
-- duplicate rows are left alone: bookings point at a session id, so combining
-- them is not a migration. The trigger only watches new inserts, which is why
-- this does not add an exclusion constraint (that would fail on those rows).
--
-- Safe to run more than once.

alter table public.listings
  add column if not exists duration_mins integer;

update public.listings as listing
set duration_mins = greatest(
  coalesce(
    (
      select session.duration_mins
      from public.sessions as session
      where session.listing_id = listing.id
        and session.status is distinct from 'cancelled'
      order by session.starts_at desc
      limit 1
    ),
    (
      select session.duration_mins
      from public.sessions as session
      where session.listing_id = listing.id
      order by session.starts_at desc
      limit 1
    ),
    60
  ),
  1
)
where listing.duration_mins is null;

alter table public.listings
  alter column duration_mins set not null;

alter table public.listings
  drop constraint if exists listings_duration_mins_positive;

alter table public.listings
  add constraint listings_duration_mins_positive check (duration_mins >= 1);

create or replace function public.session_overlap_message(
  p_starts_at timestamptz,
  p_duration_mins integer
)
returns text
language sql
stable
set search_path = public
as $$
  select format(
    'That time overlaps the session on %s at %s (%s mins).',
    to_char(p_starts_at at time zone 'Asia/Singapore', 'Dy, FMDD Mon'),
    to_char(p_starts_at at time zone 'Asia/Singapore', 'FMHH12:MI am'),
    p_duration_mins
  );
$$;

revoke all on function public.session_overlap_message(timestamptz, integer) from public, anon, authenticated;

create or replace function public.reject_overlapping_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clash public.sessions;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  if new.duration_mins is null or new.duration_mins < 1 then
    raise exception 'Duration must be at least 1 minute.';
  end if;

  -- One writer at a time per listing, including add_listing_session.
  perform 1
  from public.listings
  where id = new.listing_id
  for update;

  select *
  into v_clash
  from public.sessions
  where listing_id = new.listing_id
    and id is distinct from new.id
    and status is distinct from 'cancelled'
    and starts_at < new.starts_at + make_interval(mins => new.duration_mins)
    and starts_at + make_interval(mins => duration_mins) > new.starts_at
  order by starts_at
  limit 1;

  if found then
    raise exception '%', public.session_overlap_message(v_clash.starts_at, v_clash.duration_mins);
  end if;

  return new;
end;
$$;

revoke all on function public.reject_overlapping_session() from public, anon;
grant execute on function public.reject_overlapping_session() to authenticated;

drop trigger if exists sessions_reject_overlap on public.sessions;

create trigger sessions_reject_overlap
  before insert on public.sessions
  for each row
  execute function public.reject_overlapping_session();

create or replace function public.add_listing_session(
  p_listing_id uuid,
  p_starts_at timestamptz,
  p_spots integer
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
    update public.sessions
    set
      spots_total = spots_total + p_spots,
      spots_remaining = spots_remaining + p_spots,
      status = 'open'
    where id = v_existing.id
    returning spots_total, spots_remaining
    into v_total, v_remaining;

    return jsonb_build_object(
      'session_id', v_existing.id,
      'action', 'merged',
      'spots_added', p_spots,
      'spots_total', v_total,
      'spots_remaining', v_remaining,
      'starts_at', p_starts_at
    );
  end if;

  insert into public.sessions (
    listing_id,
    starts_at,
    duration_mins,
    spots_total,
    spots_remaining,
    status
  )
  values (
    p_listing_id,
    p_starts_at,
    v_listing.duration_mins,
    p_spots,
    p_spots,
    'open'
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

revoke all on function public.add_listing_session(uuid, timestamptz, integer) from public, anon;
grant execute on function public.add_listing_session(uuid, timestamptz, integer) to authenticated;
