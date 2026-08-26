-- Signup insert/select, host verification updates, and suspension fields.
-- Applied by hand on staging (trykai-staging / hzgybclfvpuxkmytdoos) on 22 Aug 2026.
-- Safe to run more than once.
--
-- Does not include confirm_booking / get_listing_address; those live in
-- 00002_address_reveal_and_confirm_booking.sql.

-- ===========================================================================
-- 1. Suspension fields and data safety constraints
-- Needed for P0.4 (suspend a user), plus basic integrity that was not
-- enforced on the live tables.
-- ===========================================================================

alter table public.users
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_spots_remaining_nonneg') then
    alter table public.sessions add constraint sessions_spots_remaining_nonneg check (spots_remaining >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_spots_within_total') then
    alter table public.sessions add constraint sessions_spots_within_total check (spots_remaining <= spots_total) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_host_strikes_nonneg') then
    alter table public.users add constraint users_host_strikes_nonneg check (host_strikes >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listings_price_nonneg') then
    alter table public.listings add constraint listings_price_nonneg check (price_per_person >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_total_nonneg') then
    alter table public.bookings add constraint bookings_total_nonneg check (total_amount >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reviews_rating_range') then
    alter table public.reviews add constraint reviews_rating_range check (rating between 1 and 5) not valid;
  end if;
end $$;

-- ===========================================================================
-- 2. Signup: authenticated users must be able to insert and read their own
-- public.users row. Staging copied from production was blocking this.
-- ===========================================================================

alter table public.users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'users_insert_self_check'
  ) then
    create policy users_insert_self_check on public.users
      for insert to authenticated
      with check (id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'users_select_self_check'
  ) then
    create policy users_select_self_check on public.users
      for select to authenticated
      using (id = auth.uid());
  end if;
end $$;

-- ===========================================================================
-- 3. Host verification submission: allow a user to write their own
-- id_photo_url, selfie_url, and verification_status. Paired with a trigger
-- that blocks self-approval, strike resets, and clearing a suspension.
-- Table Editor / service_role is unaffected.
--
-- Note: GRANT UPDATE on listed columns is additive. If authenticated already
-- has GRANT ALL on public.users (as in 00001_baseline.sql), this does not
-- revoke access to other columns. The trigger is the real guard.
-- CreateListing.jsx still updates is_host from the client, so do not revoke
-- UPDATE on users without also allowing that column (or moving it server-side).
-- Dashboard.jsx currently increments host_strikes from the client on host
-- cancel; this trigger will reject that path, which is intended.
-- ===========================================================================

grant update (full_name, avatar_url, phone, id_photo_url, selfie_url, verification_status)
  on public.users to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'users_update_own_extended'
  ) then
    create policy users_update_own_extended on public.users
      for update to authenticated
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;
end $$;

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
       or new.suspension_reason is distinct from old.suspension_reason then
      raise exception 'not allowed to change strike or suspension fields directly';
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

drop trigger if exists guard_user_self_update_trigger on public.users;
create trigger guard_user_self_update_trigger
  before update on public.users
  for each row
  execute function public.guard_user_self_update();
