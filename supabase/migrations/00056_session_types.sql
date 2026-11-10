-- Session types, v1 (DECISIONS.md, 10 November 2026).
--
-- A listing can offer up to 4 types (for example "Hand-tied bouquet" and
-- "Table centrepiece"), each with a name, a short description and an optional
-- photo. The host sets the type on each session when adding dates, so a guest
-- picks the type by picking the date. Every type costs the listing's price for
-- now; nothing about money changes.
--
-- sessions.type_id is set when the session is created and never changed by
-- clients (no UPDATE grant), so a booking always keeps the type it was made
-- for. Removing a type is a soft delete (is_active = false): its sessions and
-- bookings still show the name.
--
-- Types are not private, so anyone can read every type row (removed ones too,
-- so an old booking can still name its type).
--
-- Additive. Safe to run more than once.

create table if not exists public.listing_session_types (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  description text not null default '' check (char_length(description) <= 140),
  photo_url text,
  position smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_session_types_listing_idx
  on public.listing_session_types (listing_id)
  where is_active;

comment on table public.listing_session_types is
  'Up to 4 types per listing. Hosts edit them in Edit listing; sessions.type_id points here.';

-- ---------------------------------------------------------------------------
-- Guards (same shape as listing_addons, 00042)
-- ---------------------------------------------------------------------------

create or replace function public.listing_session_types_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists listing_session_types_set_updated_at on public.listing_session_types;
create trigger listing_session_types_set_updated_at
  before update on public.listing_session_types
  for each row
  execute function public.listing_session_types_set_updated_at();

create or replace function public.listing_session_types_guard()
returns trigger
language plpgsql
as $$
declare
  v_host uuid;
begin
  if tg_op = 'UPDATE' and new.listing_id is distinct from old.listing_id then
    raise exception 'A session type cannot move to another listing.';
  end if;

  if new.is_active and (
    select count(*)
    from public.listing_session_types t
    where t.listing_id = new.listing_id
      and t.is_active
      and t.id is distinct from new.id
  ) >= 4 then
    raise exception 'A listing can have at most 4 session types.';
  end if;

  if new.photo_url is not null and btrim(new.photo_url) = '' then
    new.photo_url := null;
  end if;
  if new.photo_url is not null then
    select l.host_id into v_host from public.listings l where l.id = new.listing_id;
    if v_host is null
      or strpos(new.photo_url, '/storage/v1/object/public/listing-photos/' || v_host::text || '/') = 0
    then
      raise exception 'Session type photos must be in this listing''s listing-photos folder.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists listing_session_types_guard on public.listing_session_types;
create trigger listing_session_types_guard
  before insert or update on public.listing_session_types
  for each row
  execute function public.listing_session_types_guard();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.listing_session_types enable row level security;

drop policy if exists listing_session_types_select on public.listing_session_types;
create policy listing_session_types_select on public.listing_session_types
  for select
  to anon, authenticated
  using (true);

drop policy if exists listing_session_types_insert on public.listing_session_types;
create policy listing_session_types_insert on public.listing_session_types
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_session_types.listing_id
        and l.host_id = auth.uid()
    )
  );

drop policy if exists listing_session_types_update on public.listing_session_types;
create policy listing_session_types_update on public.listing_session_types
  for update
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_session_types.listing_id
        and l.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_session_types.listing_id
        and l.host_id = auth.uid()
    )
  );

revoke all on table public.listing_session_types from public, anon, authenticated;
grant all on table public.listing_session_types to service_role;

grant select (
  id, listing_id, name, description, photo_url, position, is_active, created_at, updated_at
) on table public.listing_session_types to anon, authenticated;

grant insert (listing_id, name, description, photo_url, position)
  on table public.listing_session_types to authenticated;

grant update (name, description, photo_url, position, is_active)
  on table public.listing_session_types to authenticated;

-- ---------------------------------------------------------------------------
-- sessions.type_id
-- ---------------------------------------------------------------------------

alter table public.sessions
  add column if not exists type_id uuid references public.listing_session_types (id) on delete set null;

create index if not exists sessions_type_id_idx on public.sessions (type_id) where type_id is not null;

comment on column public.sessions.type_id is
  'Session type (00056). Set when the session is created; clients cannot change it.';

-- 00009 granted table INSERT on sessions, so type_id is insertable already.
-- Say it anyway, and keep it out of UPDATE.
grant insert (type_id) on table public.sessions to authenticated;
revoke update (type_id) on table public.sessions from public, anon, authenticated;

-- A new session's type must be an active type of the same listing.
create or replace function public.sessions_guard_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.type_id is not distinct from old.type_id then
    return new;
  end if;
  if not exists (
    select 1
    from public.listing_session_types t
    where t.id = new.type_id
      and t.listing_id = new.listing_id
      and (t.is_active or tg_op = 'UPDATE')
  ) then
    raise exception 'Pick one of this listing''s session types.';
  end if;
  return new;
end;
$$;

revoke all on function public.sessions_guard_type() from public, anon, authenticated;

drop trigger if exists sessions_guard_type on public.sessions;
create trigger sessions_guard_type
  before insert or update of type_id on public.sessions
  for each row
  execute function public.sessions_guard_type();

-- ---------------------------------------------------------------------------
-- add_listing_session with a type. Same as 00018 plus p_type_id. A time that
-- already has a session of the same type gets the spots added (as before); a
-- different type at that time is refused, because the host cannot run two
-- classes at once. The old three-argument call still works (p_type_id null).
-- ---------------------------------------------------------------------------

drop function if exists public.add_listing_session(uuid, timestamptz, integer);

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
