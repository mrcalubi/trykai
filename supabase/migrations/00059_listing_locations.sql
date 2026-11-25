-- Listing locations, v1 (DECISIONS.md, 25 November 2026).
--
-- A host with a team can offer one listing at up to 4 places at once. Each
-- location runs its own sessions with their own spots, so a booking in
-- Tampines never closes the same time in Jurong East. Hosts turn this on with
-- listings.multi_location after ticking a disclaimer that they can run every
-- location at the same time; without it a listing keeps exactly one location,
-- as today.
--
--   * listing_locations: label, area, full_address, arrival_instructions.
--     The address and directions stay private exactly like the listing's
--     columns (00025, 00046): no client SELECT grant. The host, or a guest or
--     companion with a confirmed booking at that location, reads them through
--     listing_location_details. A guest who booked Tampines never gets the
--     Jurong East address.
--   * Every listing gets one location from its current area, address and
--     directions. The first active location (lowest position) is the primary
--     one: triggers keep listings.area, full_address and arrival_instructions
--     equal to it both ways, so browse, the link preview, admin review, the
--     listing review guard, Edge Function emails and the current Create and
--     Edit listing pages keep working unchanged.
--   * sessions.location_id is required. It is filled in when the listing has
--     one location; a listing with several needs it ('Pick a location for
--     these dates.'). Set when the session is created, never changed.
--   * Per location now, not per listing: the overlap refusal (00018) and its
--     edit check (00024), and the 'That time is already on.' rule (00057).
--   * Host holds (00033): sessions of one multi-location listing at different
--     locations never hold each other. A booking on another listing of the
--     same host still holds every overlapping session, as before.
--   * listing_address and listing_arrival_instructions: the host still gets
--     the primary location. A guest now gets the location they booked (their
--     next session there, else their latest), not the listing's.
--
-- Nothing changes for guests or hosts until the app writes a second location.
-- Additive. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. listings.multi_location
-- ---------------------------------------------------------------------------

alter table public.listings
  add column if not exists multi_location boolean not null default false;

alter table public.listings
  add column if not exists multi_location_confirmed_at timestamptz;

comment on column public.listings.multi_location is
  'Host offers this listing at several locations at the same time (00059). Needed for a second active location.';
comment on column public.listings.multi_location_confirmed_at is
  'When the host last turned on multiple locations, which the app allows only after they tick the disclaimer. Set by trigger.';

grant select (multi_location) on table public.listings to anon, authenticated;
grant update (multi_location) on table public.listings to authenticated;

-- ---------------------------------------------------------------------------
-- 2. listing_locations
-- ---------------------------------------------------------------------------

create table if not exists public.listing_locations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  label text check (label is null or char_length(btrim(label)) between 1 and 40),
  area text references public.planning_areas (name),
  -- Same rules as the listing columns they mirror, so a sync never fails on one side.
  full_address text,
  arrival_instructions text check (arrival_instructions is null or char_length(arrival_instructions) <= 200),
  position smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_locations_listing_idx
  on public.listing_locations (listing_id, position)
  where is_active;

comment on table public.listing_locations is
  'Where a listing runs (00059). One per listing unless listings.multi_location; up to 4. Address and directions are private.';
comment on column public.listing_locations.label is
  'Optional short name guests see, e.g. "Tampines studio". Null shows the area.';

-- Every listing gets its current place as its first location.
insert into public.listing_locations (listing_id, area, full_address, arrival_instructions, position)
select l.id, l.area, l.full_address, l.arrival_instructions, 0
from public.listings l
where not exists (
  select 1 from public.listing_locations loc where loc.listing_id = l.id
);

-- The active location guests and the listing columns treat as the listing's own.
create or replace function public.listing_primary_location(p_listing_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select loc.id
  from public.listing_locations loc
  where loc.listing_id = p_listing_id
    and loc.is_active
  order by loc.position, loc.created_at, loc.id
  limit 1;
$$;

revoke all on function public.listing_primary_location(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. sessions.location_id
-- ---------------------------------------------------------------------------

alter table public.sessions
  add column if not exists location_id uuid references public.listing_locations (id);

update public.sessions s
set location_id = public.listing_primary_location(s.listing_id)
where s.location_id is null
  and s.listing_id is not null;

-- Raises if a session has no listing, which no app path creates.
alter table public.sessions alter column location_id set not null;

create index if not exists sessions_location_id_idx on public.sessions (location_id);

comment on column public.sessions.location_id is
  'Where this session runs (00059). Filled in when the listing has one location; set once, never changed.';

-- sessions has table-level INSERT and SELECT for clients (00009, 00025), so
-- location_id is readable and insertable already. No client UPDATE exists;
-- say it anyway, like type_id (00056).
revoke update (location_id) on table public.sessions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Guards
-- ---------------------------------------------------------------------------

create or replace function public.listing_locations_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_multi boolean;
  v_others integer;
begin
  if tg_op = 'UPDATE' and new.listing_id is distinct from old.listing_id then
    raise exception 'A location cannot move to another listing.';
  end if;

  -- One writer at a time per listing, so two adds cannot both pass the cap.
  select l.multi_location
  into v_multi
  from public.listings l
  where l.id = new.listing_id
  for update;

  new.label := nullif(btrim(new.label), '');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  select count(*)
  into v_others
  from public.listing_locations loc
  where loc.listing_id = new.listing_id
    and loc.is_active
    and loc.id is distinct from new.id;

  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    if v_others >= 4 then
      raise exception 'A listing can have at most 4 locations.';
    end if;
    if v_others >= 1 and not coalesce(v_multi, false) then
      raise exception 'Turn on multiple locations first.';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.is_active and not new.is_active then
    if v_others = 0 then
      raise exception 'A listing needs at least one location.';
    end if;
    if exists (
      select 1
      from public.sessions s
      where s.location_id = new.id
        and s.starts_at > now()
        and s.status is distinct from 'cancelled'
    ) then
      raise exception 'Remove this location''s upcoming dates first.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.listing_locations_guard() from public, anon, authenticated;

drop trigger if exists listing_locations_guard on public.listing_locations;
create trigger listing_locations_guard
  before insert or update on public.listing_locations
  for each row
  execute function public.listing_locations_guard();

-- multi_location: record when it is turned on; refuse turning it off while a
-- second location is still active.
create or replace function public.listings_guard_multi_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.multi_location_confirmed_at := case when new.multi_location then now() end;
    return new;
  end if;

  if new.multi_location and not old.multi_location then
    new.multi_location_confirmed_at := now();
  elsif old.multi_location and not new.multi_location then
    if (
      select count(*)
      from public.listing_locations loc
      where loc.listing_id = new.id
        and loc.is_active
    ) > 1 then
      raise exception 'Remove the other locations first.';
    end if;
    new.multi_location_confirmed_at := old.multi_location_confirmed_at;
  else
    new.multi_location_confirmed_at := old.multi_location_confirmed_at;
  end if;

  return new;
end;
$$;

revoke all on function public.listings_guard_multi_location() from public, anon, authenticated;

drop trigger if exists listings_guard_multi_location on public.listings;
create trigger listings_guard_multi_location
  before insert or update of multi_location, multi_location_confirmed_at on public.listings
  for each row
  execute function public.listings_guard_multi_location();

-- ---------------------------------------------------------------------------
-- 5. Keep the listing columns equal to the primary location, both ways.
--    Each side writes only when the values differ, so the pair stops after
--    one round.
-- ---------------------------------------------------------------------------

create or replace function public.listing_locations_sync_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listings l
  set
    area = p.area,
    full_address = p.full_address,
    arrival_instructions = p.arrival_instructions
  from public.listing_locations p
  where l.id = new.listing_id
    and p.id = public.listing_primary_location(new.listing_id)
    and (l.area, l.full_address, l.arrival_instructions)
        is distinct from (p.area, p.full_address, p.arrival_instructions);
  return null;
end;
$$;

revoke all on function public.listing_locations_sync_listing() from public, anon, authenticated;

drop trigger if exists listing_locations_sync_listing on public.listing_locations;
create trigger listing_locations_sync_listing
  after insert or update on public.listing_locations
  for each row
  execute function public.listing_locations_sync_listing();

create or replace function public.listings_sync_primary_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary uuid;
begin
  v_primary := public.listing_primary_location(new.id);

  if v_primary is null then
    insert into public.listing_locations (listing_id, area, full_address, arrival_instructions, position)
    values (new.id, new.area, new.full_address, new.arrival_instructions, 0);
    return null;
  end if;

  update public.listing_locations loc
  set
    area = new.area,
    full_address = new.full_address,
    arrival_instructions = new.arrival_instructions
  where loc.id = v_primary
    and (loc.area, loc.full_address, loc.arrival_instructions)
        is distinct from (new.area, new.full_address, new.arrival_instructions);
  return null;
end;
$$;

revoke all on function public.listings_sync_primary_location() from public, anon, authenticated;

drop trigger if exists listings_sync_primary_location on public.listings;
create trigger listings_sync_primary_location
  after insert or update of area, full_address, arrival_instructions on public.listings
  for each row
  execute function public.listings_sync_primary_location();

-- ---------------------------------------------------------------------------
-- 6. RLS and grants
-- ---------------------------------------------------------------------------

alter table public.listing_locations enable row level security;

drop policy if exists listing_locations_select on public.listing_locations;
create policy listing_locations_select on public.listing_locations
  for select
  to anon, authenticated
  using (true);

drop policy if exists listing_locations_insert on public.listing_locations;
create policy listing_locations_insert on public.listing_locations
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_locations.listing_id
        and l.host_id = auth.uid()
    )
  );

drop policy if exists listing_locations_update on public.listing_locations;
create policy listing_locations_update on public.listing_locations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_locations.listing_id
        and l.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_locations.listing_id
        and l.host_id = auth.uid()
    )
  );

revoke all on table public.listing_locations from public, anon, authenticated;
grant all on table public.listing_locations to service_role;

-- Not full_address or arrival_instructions: those go through listing_location_details.
grant select (
  id, listing_id, label, area, position, is_active, created_at, updated_at
) on table public.listing_locations to anon, authenticated;

grant insert (listing_id, label, area, full_address, arrival_instructions, position)
  on table public.listing_locations to authenticated;

grant update (label, area, full_address, arrival_instructions, position, is_active)
  on table public.listing_locations to authenticated;

-- ---------------------------------------------------------------------------
-- 7. A session's location: filled in, checked, never changed.
--    Named to sort first: Postgres runs BEFORE triggers in name order, and the
--    hold (sessions_apply_host_hold) and overlap (sessions_reject_overlap)
--    checks need the location.
-- ---------------------------------------------------------------------------

create or replace function public.sessions_set_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.location_id is distinct from old.location_id then
      raise exception 'A session''s location cannot change.';
    end if;
    return new;
  end if;

  if new.location_id is null then
    select count(*)
    into v_count
    from public.listing_locations loc
    where loc.listing_id = new.listing_id
      and loc.is_active;
    if v_count = 1 then
      new.location_id := public.listing_primary_location(new.listing_id);
    elsif v_count = 0 then
      raise exception 'This listing has no location yet.';
    else
      raise exception 'Pick a location for these dates.';
    end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.listing_locations loc
    where loc.id = new.location_id
      and loc.listing_id = new.listing_id
      and loc.is_active
  ) then
    raise exception 'Pick one of this listing''s locations.';
  end if;

  return new;
end;
$$;

revoke all on function public.sessions_set_location() from public, anon, authenticated;

drop trigger if exists sessions_aa_set_location on public.sessions;
create trigger sessions_aa_set_location
  before insert or update of location_id on public.sessions
  for each row
  execute function public.sessions_set_location();

-- ---------------------------------------------------------------------------
-- 8. Overlaps are per location. Same bodies as 00018 and 00024 plus the
--    location condition. A one-location listing behaves exactly as before.
-- ---------------------------------------------------------------------------

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
    and location_id is not distinct from new.location_id
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
    and location_id is not distinct from v_session.location_id
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

-- ---------------------------------------------------------------------------
-- 9. Host holds (00033): another location of the same multi-location listing
--    is never a clash. The four-argument form looks the session up, so
--    confirm_paid_booking (00043) and reschedule_booking (00046) need no
--    change; their "set status = 'held'" writes go through the trigger below,
--    which puts an exempt session straight back to open.
-- ---------------------------------------------------------------------------

create or replace function public.host_booked_overlap(
  p_host_id uuid,
  p_session_id uuid,
  p_starts_at timestamptz,
  p_duration_mins integer,
  p_listing_id uuid,
  p_location_id uuid
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
    and not (
      l.multi_location
      and s.listing_id = p_listing_id
      and s.location_id is distinct from p_location_id
    )
    and exists (
      select 1 from public.bookings b
      where b.session_id = s.id and b.status = 'confirmed'
    )
  order by s.starts_at
  limit 1;
$$;

revoke all on function public.host_booked_overlap(uuid, uuid, timestamptz, integer, uuid, uuid)
  from public, anon, authenticated;

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
  select public.host_booked_overlap(
    p_host_id,
    p_session_id,
    p_starts_at,
    p_duration_mins,
    (select s.listing_id from public.sessions s where s.id = p_session_id),
    (select s.location_id from public.sessions s where s.id = p_session_id)
  );
$$;

revoke all on function public.host_booked_overlap(uuid, uuid, timestamptz, integer) from public, anon, authenticated;

-- Same as 00033, but passes the row's own listing and location: on insert the
-- row is not in the table yet, so the four-argument lookup would miss it.
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
  v_holder := public.host_booked_overlap(
    v_host, new.id, new.starts_at, new.duration_mins, new.listing_id, new.location_id
  );

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

-- ---------------------------------------------------------------------------
-- 10. add_listing_session with a location. Same as 00057 plus p_location_id;
--     the repeat-time and other-class checks look only at that location. No
--     location given works when the listing has one. The four-argument call
--     still works.
-- ---------------------------------------------------------------------------

drop function if exists public.add_listing_session(uuid, timestamptz, integer, uuid);

create or replace function public.add_listing_session(
  p_listing_id uuid,
  p_starts_at timestamptz,
  p_spots integer,
  p_type_id uuid default null,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_existing public.sessions;
  v_location uuid;
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

  v_location := p_location_id;
  if v_location is null then
    if (
      select count(*)
      from public.listing_locations loc
      where loc.listing_id = p_listing_id
        and loc.is_active
    ) > 1 then
      raise exception 'Pick a location for these dates.';
    end if;
    v_location := public.listing_primary_location(p_listing_id);
  end if;

  select *
  into v_existing
  from public.sessions
  where listing_id = p_listing_id
    and location_id is not distinct from v_location
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
    -- Spots come from the listing (00057).
    raise exception 'That time is already on.';
  end if;

  insert into public.sessions (
    listing_id,
    starts_at,
    duration_mins,
    spots_total,
    spots_remaining,
    status,
    type_id,
    location_id
  )
  values (
    p_listing_id,
    p_starts_at,
    v_listing.duration_mins,
    p_spots,
    p_spots,
    'open',
    p_type_id,
    v_location
  )
  returning id
  into v_id;

  return jsonb_build_object(
    'session_id', v_id,
    'action', 'created',
    'spots_added', p_spots,
    'spots_total', p_spots,
    'spots_remaining', p_spots,
    'starts_at', p_starts_at,
    'location_id', v_location
  );
end;
$$;

revoke all on function public.add_listing_session(uuid, timestamptz, integer, uuid, uuid) from public, anon;
grant execute on function public.add_listing_session(uuid, timestamptz, integer, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Who sees which address.
-- ---------------------------------------------------------------------------

-- Every active location of a listing, plus any removed one the caller booked.
-- full_address and arrival_instructions are filled only for the host, or for a
-- guest or companion with a confirmed booking at that location; null otherwise.
create or replace function public.listing_location_details(p_listing_id uuid)
returns table (
  id uuid,
  label text,
  area text,
  "position" smallint,
  is_active boolean,
  full_address text,
  arrival_instructions text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_host uuid;
begin
  select l.host_id
  into v_host
  from public.listings l
  where l.id = p_listing_id;

  if not found then
    return;
  end if;

  return query
  select
    loc.id,
    loc.label,
    loc.area,
    loc.position,
    loc.is_active,
    case when a.allowed then loc.full_address end,
    case when a.allowed then loc.arrival_instructions end
  from public.listing_locations loc
  cross join lateral (
    select v_uid is not null and (
      v_uid = v_host
      or exists (
        select 1
        from public.bookings b
        join public.sessions s on s.id = b.session_id
        where s.location_id = loc.id
          and b.status = 'confirmed'
          and (b.guest_id = v_uid or public.is_booking_companion(b.id, v_uid))
      )
    ) as allowed
  ) a
  where loc.listing_id = p_listing_id
    and (loc.is_active or a.allowed)
  order by loc.position, loc.created_at, loc.id;
end;
$$;

revoke all on function public.listing_location_details(uuid) from public;
grant execute on function public.listing_location_details(uuid) to anon, authenticated;

-- Same signatures and callers as 00050. The host still gets the primary
-- location (the listing columns); a guest gets the place they booked.
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

  -- Their next confirmed session's location, else their latest.
  select loc.full_address
  into v_address
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listing_locations loc on loc.id = s.location_id
  where b.status = 'confirmed'
    and s.listing_id = listing_address.listing_id
    and (b.guest_id = auth.uid() or public.is_booking_companion(b.id, auth.uid()))
  order by
    (s.starts_at < now()),
    case when s.starts_at >= now() then s.starts_at end,
    s.starts_at desc
  limit 1;

  if found then
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

  select loc.arrival_instructions
  into v_instructions
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listing_locations loc on loc.id = s.location_id
  where b.status = 'confirmed'
    and s.listing_id = listing_arrival_instructions.listing_id
    and (b.guest_id = auth.uid() or public.is_booking_companion(b.id, auth.uid()))
  order by
    (s.starts_at < now()),
    case when s.starts_at >= now() then s.starts_at end,
    s.starts_at desc
  limit 1;

  if found then
    return v_instructions;
  end if;

  return null;
end;
$$;

revoke all on function public.listing_arrival_instructions(uuid) from public, anon;
grant execute on function public.listing_arrival_instructions(uuid) to authenticated;

revoke truncate, trigger, references
  on table public.listing_locations
  from public, anon, authenticated;
