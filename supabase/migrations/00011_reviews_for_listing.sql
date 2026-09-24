-- Listing-page reviews cannot join bookings from the client.
--
-- Reviews are public (`Anyone can view reviews`). Bookings are not: 00005
-- revoked anon SELECT, and RLS only lets the guest or the host of that
-- session read a row. PostgREST applies that RLS to `bookings!inner`, so a
-- logged-out visitor or any other user got zero reviews on the listing page.
--
-- This function joins reviews → bookings → sessions as the definer and
-- returns only the public review fields. It does not expose booking rows.
--
-- Also tightens guest review INSERT (P2.3): confirmed booking, session ended,
-- reviewee is the listing host, and one review per booking per role.
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

-- Security definer so the INSERT policy does not depend on the caller being
-- able to SELECT bookings / sessions / listings (same shape as 00008).
create or replace function public.guest_can_leave_review(
  p_booking_id uuid,
  p_reviewer_id uuid,
  p_reviewee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings
    join public.sessions on sessions.id = bookings.session_id
    join public.listings on listings.id = sessions.listing_id
    where bookings.id = p_booking_id
      and bookings.guest_id = p_reviewer_id
      and bookings.status = 'confirmed'
      and now() > sessions.starts_at + (sessions.duration_mins * interval '1 minute')
      and listings.host_id = p_reviewee_id
  );
$$;

revoke all on function public.guest_can_leave_review(uuid, uuid, uuid) from public;
grant execute on function public.guest_can_leave_review(uuid, uuid, uuid) to authenticated;

drop policy if exists "Guests can leave reviews" on public.reviews;

create policy "Guests can leave reviews" on public.reviews
  for insert
  to authenticated
  with check (
    auth.uid() = reviewer_id
    and role = 'guest'
    and public.guest_can_leave_review(booking_id, reviewer_id, reviewee_id)
  );

do $$
begin
  if exists (
    select 1
    from public.reviews
    group by booking_id, role
    having count(*) > 1
  ) then
    raise exception
      'reviews has more than one row per (booking_id, role); resolve before applying 00011';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reviews'::regclass
      and conname = 'reviews_booking_id_role_key'
  ) then
    alter table public.reviews
      add constraint reviews_booking_id_role_key unique (booking_id, role);
  end if;
end $$;
