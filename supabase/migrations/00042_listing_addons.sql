-- Paid add-ons on listings (DECISIONS.md, 30 October 2026).
--
-- Hosts can attach up to three optional extras to a listing. They set the
-- dollar they receive (S$1–S$500, whole dollars). Guests will pay that plus
-- the 12% booking fee, rounded up per unit, with no S$2.50 floor — checkout
-- and display of that guest price are the next PR. This table is the host
-- editor and admin review only.
--
-- Removing an add-on is a soft delete (`is_active = false`). Bookings will
-- snapshot what was paid (next PR); editing or removing only affects new
-- bookings. There is no client DELETE grant.
--
-- Photo URLs, when set, must live in the listing host's folder of the public
-- listing-photos bucket. The check is a trigger because it needs
-- listings.host_id.
--
-- Safe to run more than once.

create table if not exists public.listing_addons (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 60),
  description text not null default ''
    check (char_length(description) <= 140),
  price_cents integer not null
    check (price_cents between 100 and 50000 and price_cents % 100 = 0),
  unit text not null
    check (unit in ('person', 'booking')),
  session_limit integer
    check (session_limit between 1 and 99),
  photo_url text,
  position smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_addons_listing_id_active_idx
  on public.listing_addons (listing_id)
  where is_active;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.listing_addons_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists listing_addons_set_updated_at on public.listing_addons;
create trigger listing_addons_set_updated_at
  before update on public.listing_addons
  for each row
  execute function public.listing_addons_set_updated_at();

create or replace function public.listing_addons_guard_active()
returns trigger
language plpgsql
as $$
begin
  if new.is_active then
    if (
      select count(*)
      from public.listing_addons a
      where a.listing_id = new.listing_id
        and a.is_active
        and a.id is distinct from new.id
    ) >= 3 then
      raise exception 'A listing can have at most 3 add-ons.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists listing_addons_guard_active on public.listing_addons;
create trigger listing_addons_guard_active
  before insert or update on public.listing_addons
  for each row
  execute function public.listing_addons_guard_active();

create or replace function public.listing_addons_guard_photo()
returns trigger
language plpgsql
as $$
declare
  host uuid;
begin
  if new.photo_url is not null and btrim(new.photo_url) = '' then
    new.photo_url := null;
  end if;
  if new.photo_url is null then
    return new;
  end if;

  select l.host_id into host
  from public.listings l
  where l.id = new.listing_id;

  if host is null
    or strpos(
      new.photo_url,
      '/storage/v1/object/public/listing-photos/' || host::text || '/'
    ) = 0
  then
    raise exception 'Add-on photos must be in this listing''s listing-photos folder.';
  end if;
  return new;
end;
$$;

drop trigger if exists listing_addons_guard_photo on public.listing_addons;
create trigger listing_addons_guard_photo
  before insert or update on public.listing_addons
  for each row
  execute function public.listing_addons_guard_photo();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.listing_addons enable row level security;

drop policy if exists listing_addons_select on public.listing_addons;
create policy listing_addons_select on public.listing_addons
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_addons.listing_id
        and (listing_addons.is_active or l.host_id = auth.uid())
    )
  );

drop policy if exists listing_addons_insert on public.listing_addons;
create policy listing_addons_insert on public.listing_addons
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.listings l
      where l.id = listing_addons.listing_id
        and l.host_id = auth.uid()
    )
  );

drop policy if exists listing_addons_update on public.listing_addons;
create policy listing_addons_update on public.listing_addons
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_addons.listing_id
        and l.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.listings l
      where l.id = listing_addons.listing_id
        and l.host_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants (00025 style). Default privileges already revoke ALL on new tables.
-- ---------------------------------------------------------------------------

revoke all on table public.listing_addons from public, anon, authenticated;
grant all on table public.listing_addons to service_role;

grant select (
  id,
  listing_id,
  name,
  description,
  price_cents,
  unit,
  session_limit,
  photo_url,
  position,
  is_active,
  created_at,
  updated_at
) on table public.listing_addons to anon, authenticated;

grant insert (
  listing_id,
  name,
  description,
  price_cents,
  unit,
  session_limit,
  photo_url,
  position
) on table public.listing_addons to authenticated;

grant update (
  name,
  description,
  price_cents,
  unit,
  session_limit,
  photo_url,
  position,
  is_active
) on table public.listing_addons to authenticated;

revoke truncate, trigger, references
  on table public.listing_addons
  from public, anon, authenticated;
