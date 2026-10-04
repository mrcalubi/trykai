-- Browse ratings without embedding private bookings, and a host-owned
-- listing delete that also clears empty upcoming sessions.
--
-- listing_ratings: same reviews → bookings → sessions join as
-- reviews_for_listing, grouped by listing. Listings with no guest reviews
-- are omitted so the card can show price only.
--
-- delete_listing: owner only. Refuses if any upcoming session has a
-- pending or confirmed booking. Otherwise soft-deletes the listing
-- (is_active = false, same as the previous client PATCH) and sets its
-- empty upcoming sessions to cancelled, in one transaction. Clients have
-- no UPDATE grant on sessions (00009), so the session half cannot be a
-- client PATCH.
--
-- my_verification gains pending_count so the Hosting banner can show N
-- without a public COUNT on users. Non-admins always get 0.
--
-- Safe to run more than once. DROP of my_verification is required because
-- CREATE OR REPLACE cannot change a RETURNS TABLE shape.

create or replace function public.listing_ratings(listing_ids uuid[])
returns table (
  listing_id uuid,
  average numeric,
  review_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.listing_id,
    avg(r.rating)::numeric as average,
    count(*)::integer as review_count
  from public.reviews r
  join public.bookings b on b.id = r.booking_id
  join public.sessions s on s.id = b.session_id
  where s.listing_id = any(listing_ids)
    and r.role = 'guest'
  group by s.listing_id;
$$;

revoke all on function public.listing_ratings(uuid[]) from public;
grant execute on function public.listing_ratings(uuid[]) to anon, authenticated;

create or replace function public.delete_listing(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
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
  where listing_id = v_listing.id
    and starts_at > now()
  for update;

  if exists (
    select 1
    from public.sessions s
    join public.bookings b on b.session_id = s.id
    where s.listing_id = v_listing.id
      and s.starts_at > now()
      and b.status in ('pending', 'confirmed')
  ) then
    raise exception 'listing has active bookings';
  end if;

  update public.listings
  set is_active = false
  where id = v_listing.id;

  update public.sessions
  set status = 'cancelled'
  where listing_id = v_listing.id
    and starts_at > now()
    and status is distinct from 'cancelled';

  return v_listing.id;
end;
$$;

revoke all on function public.delete_listing(uuid) from public, anon;
grant execute on function public.delete_listing(uuid) to authenticated;

drop function if exists public.my_verification();

create function public.my_verification()
returns table (
  verification_status text,
  verification_method text,
  verification_rejection_reason text,
  verification_submitted_at timestamptz,
  is_admin boolean,
  pending_count integer
)
language sql
security definer
set search_path = public
as $$
  select u.verification_status,
         u.verification_method,
         u.verification_rejection_reason,
         u.verification_submitted_at,
         u.is_admin,
         case
           when u.is_admin then (
             select count(*)::integer
             from public.users
             where verification_status = 'pending'
           )
           else 0
         end as pending_count
  from public.users u
  where u.id = auth.uid();
$$;

revoke all on function public.my_verification() from public, anon;
grant execute on function public.my_verification() to authenticated;
