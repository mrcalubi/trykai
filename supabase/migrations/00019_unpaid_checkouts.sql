-- An unpaid checkout inserts a pending booking before Stripe captures anything.
-- That row is not an active booking: it must not block the host from removing
-- an empty session or listing, and a review is allowed once the session has
-- ended even when the session row never stored its own duration.

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
      and status = 'confirmed'
  ) then
    raise exception 'session has active bookings';
  end if;

  update public.sessions
  set status = 'cancelled'
  where id = p_session_id;

  return p_session_id;
end;
$$;

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
      and b.status = 'confirmed'
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
      and now() > sessions.starts_at + (
        coalesce(sessions.duration_mins, listings.duration_mins, 120) * interval '1 minute'
      )
      and listings.host_id = p_reviewee_id
  );
$$;
