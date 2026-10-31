-- Snapshot paid add-ons onto bookings, count remaining units per session,
-- and refuse an oversell at confirm. Safe to run more than once.

alter table public.bookings
  add column if not exists addons_amount integer not null default 0;

alter table public.bookings
  add column if not exists addon_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_addons_amount_nonneg'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_addons_amount_nonneg check (addons_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_addon_note_len'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_addon_note_len check (char_length(addon_note) <= 120);
  end if;
end
$$;

grant select (addons_amount, addon_note) on table public.bookings to authenticated;

create table if not exists public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  addon_id uuid references public.listing_addons(id) on delete set null,
  name text not null,
  unit text not null check (unit in ('person', 'booking')),
  quantity integer not null check (quantity >= 1),
  unit_host_cents integer not null check (unit_host_cents >= 0),
  unit_guest_cents integer not null check (unit_guest_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists booking_addons_addon_id_idx
  on public.booking_addons (addon_id);

create index if not exists booking_addons_booking_id_idx
  on public.booking_addons (booking_id);

alter table public.booking_addons enable row level security;

drop policy if exists booking_addons_select_guest_or_host on public.booking_addons;
create policy booking_addons_select_guest_or_host
on public.booking_addons
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    join public.listings l on l.id = s.listing_id
    where b.id = booking_addons.booking_id
      and (b.guest_id = auth.uid() or l.host_id = auth.uid())
  )
);

revoke all on table public.booking_addons from public, anon, authenticated;
grant select on table public.booking_addons to authenticated;

create or replace function public.session_addon_remaining(p_session_id uuid)
returns table (addon_id uuid, remaining integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    la.id,
    (
      la.session_limit
      - coalesce((
          select sum(ba.quantity)
          from public.booking_addons ba
          join public.bookings b on b.id = ba.booking_id
          where b.session_id = p_session_id
            and b.status = 'confirmed'
            and ba.addon_id = la.id
        ), 0)
    )::integer
  from public.listing_addons la
  join public.sessions s on s.listing_id = la.listing_id
  where s.id = p_session_id
    and la.is_active = true
    and la.session_limit is not null;
end;
$$;

revoke all on function public.session_addon_remaining(uuid) from public;
grant execute on function public.session_addon_remaining(uuid) to anon, authenticated;

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
  v_host uuid;
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

  -- One confirmation at a time per host, taken before any session row lock so
  -- two payments for clashing sessions cannot deadlock or both succeed.
  select l.host_id
  into v_host
  from public.sessions s
  join public.listings l on l.id = s.listing_id
  where s.id = v_booking.session_id;

  if v_host is not null then
    perform pg_advisory_xact_lock(hashtextextended('trykai_host:' || v_host::text, 0));
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

  -- The host is already booked elsewhere at this time.
  if public.host_booked_overlap(v_host, v_session.id, v_session.starts_at, v_session.duration_mins) is not null then
    raise exception 'session not open';
  end if;

  if v_session.spots_remaining < v_booking.guests_count then
    raise exception 'insufficient spots';
  end if;

  -- Same session lock: refuse an add-on oversell before spots are taken.
  if exists (
    select 1
    from public.booking_addons ba
    join public.listing_addons la on la.id = ba.addon_id
    where ba.booking_id = v_booking.id
      and la.session_limit is not null
      and (
        coalesce((
          select sum(ba2.quantity)
          from public.booking_addons ba2
          join public.bookings b2 on b2.id = ba2.booking_id
          where b2.session_id = v_session.id
            and b2.status = 'confirmed'
            and ba2.addon_id = ba.addon_id
        ), 0) + ba.quantity
      ) > la.session_limit
  ) then
    raise exception 'insufficient add-ons';
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

  -- Set aside the host's other open, unbooked sessions at the same time.
  -- The sessions trigger fills in held_by_session_id.
  update public.sessions s
  set status = 'held'
  from public.listings l
  where l.id = s.listing_id
    and l.host_id = v_host
    and s.id <> v_session.id
    and s.status = 'open'
    and s.starts_at < v_session.starts_at + make_interval(mins => v_session.duration_mins)
    and s.starts_at + make_interval(mins => s.duration_mins) > v_session.starts_at
    and not exists (
      select 1 from public.bookings b
      where b.session_id = s.id and b.status = 'confirmed'
    );

  return v_booking.id;
end;
$$;

revoke all on function public.confirm_paid_booking(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.confirm_paid_booking(uuid, text, integer, integer) to service_role;
