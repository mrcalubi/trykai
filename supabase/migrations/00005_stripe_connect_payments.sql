-- Stripe Connect payments: host payout flags, booking-level money fields,
-- service-role confirmation, and host strike increment that the client can
-- no longer perform after 00003.

-- ===========================================================================
-- 1. Columns
-- ===========================================================================

alter table public.users
  add column if not exists is_founding_host boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false;

alter table public.bookings
  add column if not exists payment_rail text,
  add column if not exists host_fee integer,
  add column if not exists host_payout_amount integer,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_refund_id text,
  add column if not exists payout_released_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_payment_rail_check') then
    alter table public.bookings
      add constraint bookings_payment_rail_check
      check (payment_rail is null or payment_rail in ('card', 'paynow'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_host_fee_nonneg') then
    alter table public.bookings
      add constraint bookings_host_fee_nonneg
      check (host_fee is null or host_fee >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_host_payout_nonneg') then
    alter table public.bookings
      add constraint bookings_host_payout_nonneg
      check (host_payout_amount is null or host_payout_amount >= 0);
  end if;
end $$;

-- ===========================================================================
-- 2. Do not leak stripe_account_id or founding-host status through the
--    public profile policy. stripe_payouts_enabled stays readable so the
--    Book button can tell whether a host can take money.
-- ===========================================================================

revoke all on table public.users from anon, authenticated;

grant select (
  id, full_name, email, phone, phone_verified, avatar_url, is_host,
  created_at, verification_status, host_strikes, stripe_payouts_enabled
) on table public.users to anon, authenticated;

grant select (id_photo_url, selfie_url) on table public.users to authenticated;

grant insert (
  id, full_name, email, phone, phone_verified, avatar_url, is_host
) on table public.users to authenticated;

grant update (
  full_name, avatar_url, phone, id_photo_url, selfie_url, verification_status, is_host
) on table public.users to authenticated;

-- ===========================================================================
-- 3. Guard trigger: clients cannot write Connect or founding-host fields.
-- ===========================================================================

create or replace function public.guard_user_self_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if new.host_strikes is distinct from old.host_strikes
       or new.is_suspended is distinct from old.is_suspended
       or new.suspended_at is distinct from old.suspended_at
       or new.suspension_reason is distinct from old.suspension_reason
       or new.stripe_account_id is distinct from old.stripe_account_id
       or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
       or new.is_founding_host is distinct from old.is_founding_host then
      raise exception 'not allowed to change strike, suspension, stripe or founding-host fields directly';
    end if;

    if new.verification_status is distinct from old.verification_status then
      if not (old.verification_status in ('unverified','rejected') and new.verification_status = 'pending') then
        raise exception 'verification status can only move to pending from unverified or rejected';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 4. confirm_paid_booking — service role only, idempotent, freezes host fee.
--    Replaces guest-callable confirm_booking used by the staging test button.
-- ===========================================================================

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

-- CREATE OR REPLACE cannot change a function's return type (42P13). Staging may
-- already have confirm_booking(uuid) from 00002 or a dashboard hotfix with a
-- different return type, so drop it first. Input args identify the function;
-- grants go with it and are re-applied below.
drop function if exists public.confirm_booking(uuid);

-- Keep confirm_booking working for anything still calling it, but only as service role,
-- and without the guest-uid check so the webhook can use either name.
create or replace function public.confirm_booking(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.confirm_paid_booking(p_booking_id, null, null, null);
end;
$$;

revoke all on function public.confirm_booking(uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking(uuid) to service_role;

-- ===========================================================================
-- 5. apply_host_strike — service role only. Replaces the client update that
--    00003 now rejects.
-- ===========================================================================

create or replace function public.apply_host_strike(p_host_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_strikes integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  update public.users
  set host_strikes = coalesce(host_strikes, 0) + 1
  where id = p_host_id
  returning host_strikes into v_strikes;

  if not found then
    raise exception 'host not found';
  end if;

  if v_strikes >= 3 then
    update public.listings
    set is_active = false
    where host_id = p_host_id;
  end if;

  return v_strikes;
end;
$$;

revoke all on function public.apply_host_strike(uuid) from public, anon, authenticated;
grant execute on function public.apply_host_strike(uuid) to service_role;

-- ===========================================================================
-- 6. Clients cannot confirm, refund, or mint bookings themselves. Money
--    movement goes through service-role Edge Functions. Hosts still need to
--    read their guests' bookings on the dashboard.
-- ===========================================================================

revoke all on table public.bookings from anon, authenticated;
grant select on table public.bookings to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bookings'
      and policyname = 'hosts_select_session_bookings'
  ) then
    create policy hosts_select_session_bookings on public.bookings
      for select to authenticated
      using (
        exists (
          select 1
          from public.sessions
          join public.listings on listings.id = sessions.listing_id
          where sessions.id = bookings.session_id
            and listings.host_id = auth.uid()
        )
      );
  end if;
end $$;

-- ===========================================================================
-- 7. Authenticated inserts cannot self-enable Connect payouts.
-- ===========================================================================

create or replace function public.guard_user_self_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    new.stripe_account_id := null;
    new.stripe_payouts_enabled := false;
    new.is_founding_host := false;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_self_insert_trigger on public.users;
create trigger guard_user_self_insert_trigger
  before insert on public.users
  for each row
  execute function public.guard_user_self_insert();
