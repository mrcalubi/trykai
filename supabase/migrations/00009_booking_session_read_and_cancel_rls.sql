-- Two staging bugs from the same RLS shape, plus the leftover 00001
-- policies that 00005 revoked GRANTs for but never dropped.
--
-- 1. Orphaned dashboard cards ("Unknown listing" / "Date TBC", no Cancel).
--    Dashboard nested-selects sessions and listings off each booking.
--    The only sessions SELECT policy is "Anyone can view open sessions"
--    (status = 'open'). confirm_paid_booking flips a sold-out row to
--    'full', PostgREST then returns sessions: null for that booking, and
--    canCancelBooking() hides the button because starts_at is missing.
--    Hosts have the same hole: a fully booked upcoming session disappears
--    from "Upcoming Hosted Sessions".
--
--    Helpers are SECURITY DEFINER so the policies do not recurse through
--    bookings ↔ sessions RLS the way 00008's can_create_listing() avoids
--    reading users under RLS.
--
-- 2. Direct PATCH /rest/v1/bookings looking like a cancel-booking bypass.
--    cancel-booking writes bookings and sessions with the service role, so
--    API logs show PATCH 204s with no matching /functions/v1/cancel-booking
--    line. 00005 already revoked INSERT/UPDATE GRANTs, but the 00001 UPDATE
--    and INSERT policies are still there. If those GRANTs are ever restored,
--    a guest JWT can set status = 'cancelled' and skip refunds, strikes, and
--    emails. Drop the policies so the GRANT hole cannot come back.
--
-- Safe to run more than once. Staging may already have ad hoc SQL.

-- ===========================================================================
-- 1. Guests and hosts can read the sessions that belong to them, any status.
-- ===========================================================================

create or replace function public.session_visible_to_me(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.bookings
      where session_id = p_session_id
        and guest_id = auth.uid()
    )
    or exists (
      select 1
      from public.sessions s
      join public.listings l on l.id = s.listing_id
      where s.id = p_session_id
        and l.host_id = auth.uid()
    );
$$;

revoke all on function public.session_visible_to_me(uuid) from public, anon;
grant execute on function public.session_visible_to_me(uuid) to authenticated;

create or replace function public.listing_booked_by_me(p_listing_id uuid)
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
    where bookings.guest_id = auth.uid()
      and sessions.listing_id = p_listing_id
  );
$$;

revoke all on function public.listing_booked_by_me(uuid) from public, anon;
grant execute on function public.listing_booked_by_me(uuid) to authenticated;

drop policy if exists guests_select_booked_sessions on public.sessions;
drop policy if exists hosts_select_own_sessions on public.sessions;
drop policy if exists participants_select_sessions on public.sessions;

create policy participants_select_sessions on public.sessions
  for select to authenticated
  using (public.session_visible_to_me(id));

-- Inactive listings are hidden by "Anyone can view active listings". A guest
-- who already booked one still needs the title on the dashboard.
drop policy if exists guests_select_booked_listings on public.listings;

create policy guests_select_booked_listings on public.listings
  for select to authenticated
  using (public.listing_booked_by_me(id));

-- ===========================================================================
-- 2. Clients cannot INSERT or UPDATE bookings. Money movement stays on
--    service-role Edge Functions (create-payment-intent, cancel-booking,
--    stripe-webhook, admin-cancel-booking).
-- ===========================================================================

drop policy if exists "Guests can cancel own bookings" on public.bookings;
drop policy if exists "Hosts can cancel bookings for their sessions" on public.bookings;
drop policy if exists "Guests can create bookings" on public.bookings;

revoke all on table public.bookings from anon, authenticated;
grant select on table public.bookings to authenticated;

-- Sessions: browse is SELECT of open rows; hosts INSERT their own. Nobody
-- except service_role should UPDATE spots or status. There was never an
-- UPDATE policy, but GRANT ALL from 00001 was still in place.
revoke all on table public.sessions from anon, authenticated;
grant select on table public.sessions to anon, authenticated;
grant insert on table public.sessions to authenticated;
