-- Profile-page reviews cannot join bookings from the client.
--
-- Same hole as listing reviews before 00011: reviews are public, bookings
-- are not. A nested bookings → sessions → listings select for the listing
-- title would return zero rows to a logged-out visitor.
--
-- reviews_for_host returns guest reviews this user has received as a host,
-- plus the listing title. It does not return reviews they wrote as a guest,
-- and it does not expose booking rows.
--
-- Both review RPCs put the reviewer's first name (first word of the stored
-- name, same split as src/lib/firstName.js) in users.full_name so ReviewCard
-- keeps its jsonb shape and the API never returns a surname.
--
-- Safe to run more than once.

create or replace function public.reviews_for_host(p_host_id uuid)
returns table (
  id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  listing_title text,
  users jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.rating,
    r.comment,
    r.created_at,
    l.title as listing_title,
    jsonb_build_object(
      'full_name',
      (regexp_split_to_array(btrim(u.full_name), '\s+'))[1]
    ) as users
  from public.reviews r
  join public.bookings b on b.id = r.booking_id
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  left join public.users u on u.id = r.reviewer_id
  where r.reviewee_id = p_host_id
    and r.role = 'guest'
    and l.host_id = p_host_id
  order by r.created_at desc;
$$;

revoke all on function public.reviews_for_host(uuid) from public;
grant execute on function public.reviews_for_host(uuid) to anon, authenticated;

create or replace function public.reviews_for_listing(p_listing_id uuid)
returns table (
  id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  users jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.rating,
    r.comment,
    r.created_at,
    jsonb_build_object(
      'full_name',
      (regexp_split_to_array(btrim(u.full_name), '\s+'))[1]
    ) as users
  from public.reviews r
  join public.bookings b on b.id = r.booking_id
  join public.sessions s on s.id = b.session_id
  left join public.users u on u.id = r.reviewer_id
  where s.listing_id = p_listing_id
    and r.role = 'guest'
  order by r.created_at desc;
$$;

revoke all on function public.reviews_for_listing(uuid) from public;
grant execute on function public.reviews_for_listing(uuid) to anon, authenticated;
