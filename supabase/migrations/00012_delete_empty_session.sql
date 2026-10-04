-- Hosts can hide an upcoming session that nobody has booked.
--
-- Clients have no UPDATE grant on sessions (00009). Soft-delete is this
-- security-definer RPC: the caller must own the listing, and no booking on
-- the row may be pending or confirmed. On success the status becomes
-- 'cancelled'. Rows are never deleted.
--
-- The session row is locked FOR UPDATE before the bookings check, so a
-- concurrent confirm_paid_booking waits on the same lock. A pending insert
-- that still slips in is refused at confirm (status must stay 'open'); the
-- webhook refunds that the same way it refunds an oversell.
--
-- Browse still uses "Anyone can view open sessions", so a cancelled row
-- disappears from the listing page. Hosts can still SELECT any status via
-- session_visible_to_me(); Hosting filters cancelled out in the query.
--
-- Safe to run more than once.

create or replace function public.delete_empty_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions;
  v_host_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'session not found';
  end if;

  select l.host_id
  into v_host_id
  from public.listings l
  where l.id = v_session.listing_id;

  if v_host_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  if exists (
    select 1
    from public.bookings
    where session_id = p_session_id
      and status in ('pending', 'confirmed')
  ) then
    raise exception 'session has active bookings';
  end if;

  update public.sessions
  set status = 'cancelled'
  where id = p_session_id;

  return p_session_id;
end;
$$;

revoke all on function public.delete_empty_session(uuid) from public, anon;
grant execute on function public.delete_empty_session(uuid) to authenticated;

-- confirm_paid_booking must not confirm onto a cancelled (or otherwise
-- non-open) session. Same shape as 00005; the added gate is status = 'open'.
-- The webhook treats 'session not open' like 'insufficient spots' and refunds.

create or replace function public.confirm_paid_booking(
  p_booking_id uuid,
  p_stripe_charge_id text default null,
  p_host_fee integer default null,
  p_host_payout_amount integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'booking not found';
  end if;

  if v_booking.status = 'confirmed' then
    return v_booking.id;
  end if;

  if v_booking.status is distinct from 'pending' then
    raise exception 'booking not pending';
  end if;

  select *
  into v_session
  from public.sessions
  where id = v_booking.session_id
  for update;

  if not found then
    raise exception 'session not found';
  end if;

  if v_session.status is distinct from 'open' then
    raise exception 'session not open';
  end if;

  if v_session.spots_remaining < v_booking.guests_count then
    raise exception 'insufficient spots';
  end if;

  update public.sessions
  set
    spots_remaining = spots_remaining - v_booking.guests_count,
    status = case
      when spots_remaining - v_booking.guests_count = 0 then 'full'
      else status
    end
  where id = v_session.id;

  update public.bookings
  set
    status = 'confirmed',
    stripe_charge_id = coalesce(p_stripe_charge_id, stripe_charge_id),
    host_fee = coalesce(p_host_fee, host_fee),
    host_payout_amount = coalesce(p_host_payout_amount, host_payout_amount)
  where id = v_booking.id;

  return v_booking.id;
end;
$$;

revoke all on function public.confirm_paid_booking(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.confirm_paid_booking(uuid, text, integer, integer) to service_role;
