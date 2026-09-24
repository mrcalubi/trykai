-- Listing-page reviews cannot join bookings from the client.
--
-- Reviews are public (`Anyone can view reviews`). Bookings are not: 00005
-- revoked anon SELECT, and RLS only lets the guest or the host of that
-- session read a row. PostgREST applies that RLS to `bookings!inner`, so a
-- logged-out visitor or any other user got zero reviews on the listing page.
--
-- This function joins reviews → bookings → sessions as the definer and
-- returns only the public review fields. It does not expose booking rows.
-- Safe to run more than once.

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
    jsonb_build_object('full_name', u.full_name) as users
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
