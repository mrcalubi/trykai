-- Supabase default GRANT ALL on listings and reviews was never tightened.
-- RLS already blocks most of those verbs; this removes the grants so a
-- later policy cannot reopen them, and so TRUNCATE/TRIGGER/REFERENCES
-- are not sitting on client roles.
--
-- listings: anon and authenticated SELECT every column except
-- full_address. authenticated INSERT (all columns) and the Edit listing
-- UPDATE columns from 00024. No DELETE. Address is listing_address().
-- reviews: anon and authenticated SELECT (listing detail and profile
-- still read reviews as anon). authenticated INSERT (00011). No UPDATE.
--
-- TRUNCATE, TRIGGER, and REFERENCES revoked on every public table.
-- Default privileges for future tables no longer dump ALL to clients.
--
-- Security-definer RPCs and service_role Edge Functions are unaffected:
-- they do not use these client grants. service_role keeps GRANT ALL.
--
-- Safe to run more than once.

revoke all on table public.listings from public, anon, authenticated;

grant select (
  id,
  host_id,
  title,
  description,
  category,
  price_per_person,
  max_guests,
  duration_mins,
  group_pricing,
  area,
  photo_urls,
  whats_provided,
  is_active,
  created_at
) on table public.listings to anon, authenticated;
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
  whats_provided,
  photo_urls
) on table public.listings to authenticated;

-- Host or confirmed guest only. Anon has no execute. Returns null
-- otherwise, including when the listing does not exist.
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
    where b.guest_id = auth.uid()
      and b.status = 'confirmed'
      and s.listing_id = listing_address.listing_id
  ) then
    return v_address;
  end if;

  return null;
end;
$$;

revoke all on function public.listing_address(uuid) from public, anon;
grant execute on function public.listing_address(uuid) to authenticated;

-- Replaced by listing_address. Nothing in src/ or Edge Functions calls it.
drop function if exists public.get_listing_address(uuid);

revoke all on table public.reviews from public, anon, authenticated;

grant select on table public.reviews to anon, authenticated;
grant insert on table public.reviews to authenticated;

revoke truncate, trigger, references
  on table public.listings
  from public, anon, authenticated;

revoke truncate, trigger, references
  on table public.reviews
  from public, anon, authenticated;

revoke truncate, trigger, references
  on table public.bookings
  from public, anon, authenticated;

revoke truncate, trigger, references
  on table public.sessions
  from public, anon, authenticated;

revoke truncate, trigger, references
  on table public.users
  from public, anon, authenticated;

revoke truncate, trigger, references
  on table public.planning_areas
  from public, anon, authenticated;

revoke truncate, trigger, references
  on table public.verification_reviews
  from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
