-- Hosts pick a URA planning area; browse filters by region.
--
-- planning_areas is the 55 Master Plan areas, each tagged Central, North,
-- North-East, East, or West. Public SELECT. listings.area is a FK to
-- planning_areas.name once existing values match case-insensitively.
-- Unmatched listing.area values are set to null (do not guess).
--
-- Names and region tags must match src/lib/planningAreas.js.
--
-- Safe to run more than once.

create table if not exists public.planning_areas (
  name text primary key,
  region text not null,
  constraint planning_areas_region_check
    check (region in ('Central', 'North', 'North-East', 'East', 'West'))
);

alter table public.planning_areas enable row level security;

drop policy if exists "Anyone can view planning areas" on public.planning_areas;
create policy "Anyone can view planning areas"
  on public.planning_areas
  for select
  using (true);

revoke all on table public.planning_areas from anon, authenticated;
grant select on table public.planning_areas to anon, authenticated;
grant all on table public.planning_areas to service_role;

insert into public.planning_areas (name, region) values
  ('Ang Mo Kio', 'North-East'),
  ('Bedok', 'East'),
  ('Bishan', 'Central'),
  ('Boon Lay', 'West'),
  ('Bukit Batok', 'West'),
  ('Bukit Merah', 'Central'),
  ('Bukit Panjang', 'West'),
  ('Bukit Timah', 'Central'),
  ('Central Water Catchment', 'North'),
  ('Changi', 'East'),
  ('Changi Bay', 'East'),
  ('Choa Chu Kang', 'West'),
  ('Clementi', 'West'),
  ('Downtown Core', 'Central'),
  ('Geylang', 'Central'),
  ('Hougang', 'North-East'),
  ('Jurong East', 'West'),
  ('Jurong West', 'West'),
  ('Kallang', 'Central'),
  ('Lim Chu Kang', 'North'),
  ('Mandai', 'North'),
  ('Marina East', 'Central'),
  ('Marina South', 'Central'),
  ('Marine Parade', 'Central'),
  ('Museum', 'Central'),
  ('Newton', 'Central'),
  ('North-Eastern Islands', 'North-East'),
  ('Novena', 'Central'),
  ('Orchard', 'Central'),
  ('Outram', 'Central'),
  ('Pasir Ris', 'East'),
  ('Paya Lebar', 'East'),
  ('Pioneer', 'West'),
  ('Punggol', 'North-East'),
  ('Queenstown', 'Central'),
  ('River Valley', 'Central'),
  ('Rochor', 'Central'),
  ('Seletar', 'North-East'),
  ('Sembawang', 'North'),
  ('Sengkang', 'North-East'),
  ('Serangoon', 'North-East'),
  ('Simpang', 'North'),
  ('Singapore River', 'Central'),
  ('Southern Islands', 'Central'),
  ('Straits View', 'Central'),
  ('Sungei Kadut', 'North'),
  ('Tampines', 'East'),
  ('Tanglin', 'Central'),
  ('Tengah', 'West'),
  ('Toa Payoh', 'Central'),
  ('Tuas', 'West'),
  ('Western Islands', 'West'),
  ('Western Water Catchment', 'West'),
  ('Woodlands', 'North'),
  ('Yishun', 'North')
on conflict (name) do update
  set region = excluded.region;

do $$
begin
  if (select count(*) from public.planning_areas) <> 55 then
    raise exception 'planning_areas must contain 55 rows, found %',
      (select count(*) from public.planning_areas);
  end if;
end $$;

do $$
declare
  rec record;
  unmatched integer := 0;
begin
  for rec in
    select id, title, area
    from public.listings
    where area is not null
      and btrim(area) <> ''
      and not exists (
        select 1
        from public.planning_areas pa
        where lower(pa.name) = lower(btrim(listings.area))
      )
  loop
    unmatched := unmatched + 1;
    raise notice 'unmatched listing area id=% title=% area=%',
      rec.id, rec.title, rec.area;
  end loop;

  if unmatched = 0 then
    raise notice 'all listing area values matched a planning area';
  else
    raise notice '% listing area value(s) did not match a planning area; setting to null',
      unmatched;
  end if;
end $$;

update public.listings as l
set area = pa.name
from public.planning_areas pa
where l.area is not null
  and lower(btrim(l.area)) = lower(pa.name)
  and l.area is distinct from pa.name;

update public.listings
set area = null
where area is not null
  and not exists (
    select 1 from public.planning_areas pa where pa.name = listings.area
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.listings'::regclass
      and conname = 'listings_area_fkey'
  ) then
    alter table public.listings
      add constraint listings_area_fkey
      foreign key (area) references public.planning_areas (name);
  end if;
end $$;
