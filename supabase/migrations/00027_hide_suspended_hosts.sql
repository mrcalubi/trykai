-- P0.4: a suspended host's listings disappear from browse, listing detail,
-- and public profiles, independent of host_strikes and is_active. The
-- published dispute policy promises suspension on a credible safety report;
-- before this, setting users.is_suspended blocked new listings (00008) but
-- the existing ones stayed visible and bookable.
--
-- Booking is blocked separately in create-payment-intent, which reads the
-- host with the service role.
--
-- Same shape as 00008: is_suspended is not granted to any client role, so
-- the policy asks a security-definer function. It takes a listing id, not a
-- user id, so it reveals nothing beyond what the hidden listing already
-- shows, and cannot be used to probe whether an arbitrary user is suspended.
--
-- Unchanged: "Hosts can view own listings" (the host still sees their own)
-- and guests_select_booked_listings (00009, a guest who booked still sees
-- the title on their bookings tab).
--
-- Undo a suspension by setting users.is_suspended = false; listings come
-- back as they were.
--
-- Safe to run more than once.

create or replace function public.listing_host_in_good_standing(listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.listings l
    join public.users u on u.id = l.host_id
    where l.id = listing_host_in_good_standing.listing_id
      and not u.is_suspended
  );
$$;

revoke all on function public.listing_host_in_good_standing(uuid) from public;
grant execute on function public.listing_host_in_good_standing(uuid) to anon, authenticated;

drop policy if exists "Anyone can view active listings" on public.listings;

create policy "Anyone can view active listings" on public.listings
  for select
  using (is_active = true and public.listing_host_in_good_standing(id));
