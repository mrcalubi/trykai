-- Host verification: move approval off the Table Editor and make the gate real.
--
-- Before this migration the verification gate was cosmetic. `Hosts can create
-- listings` (00001) checked only `auth.uid() = host_id`, so an unverified
-- account could INSERT a listing straight through PostgREST; the
-- `verification_status = 'approved'` check existed only in CreateListing.jsx.
-- Document paths were also SELECT-granted to every authenticated user, and
-- submission was a raw client UPDATE rather than the `submit_verification`
-- function the docs describe.
--
-- Safe to run more than once.

-- ===========================================================================
-- 1. Status domain
-- Normalise first: a NULL status is already treated as 'unverified' by the
-- app, so the constraint can be validated rather than left NOT VALID.
-- ===========================================================================

update public.users
set verification_status = 'unverified'
where verification_status is null
   or verification_status not in ('unverified', 'pending', 'approved', 'rejected');

alter table public.users
  alter column verification_status set default 'unverified',
  alter column verification_status set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_verification_status_check') then
    alter table public.users
      add constraint users_verification_status_check
      check (verification_status in ('unverified', 'pending', 'approved', 'rejected'));
  end if;
end $$;

-- ===========================================================================
-- 2. Columns
-- `is_admin` is what the review UI authenticates against. It is set once, by
-- hand, for Caleb; nothing in the app can grant it.
-- ===========================================================================

alter table public.users
  add column if not exists is_admin boolean not null default false,
  add column if not exists verification_method text,
  add column if not exists stripe_identity_session_id text,
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_rejection_reason text,
  add column if not exists verification_consent_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_verification_method_check') then
    alter table public.users
      add constraint users_verification_method_check
      check (verification_method is null or verification_method in ('manual', 'stripe_identity'));
  end if;
end $$;

-- ===========================================================================
-- 3. Audit trail
-- PDPC expects an organisation collecting NRIC copies to justify it on
-- request, and the safety protocol expects review outcomes to be recorded.
-- Append-only, service role only, never exposed to a client.
-- ===========================================================================

create table if not exists public.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  reviewer_id uuid references public.users(id) on delete set null,
  decision text not null check (decision in ('approved', 'rejected')),
  reason text,
  method text not null default 'manual' check (method in ('manual', 'stripe_identity')),
  created_at timestamptz not null default now()
);

create index if not exists verification_reviews_user_id_idx
  on public.verification_reviews (user_id, created_at desc);

alter table public.verification_reviews enable row level security;

revoke all on table public.verification_reviews from anon, authenticated;
grant all on table public.verification_reviews to service_role;

-- ===========================================================================
-- 4. Column privileges
-- Clients no longer write verification state or read anyone's document paths.
-- Submission goes through submit_verification; review goes through
-- review_verification. `verification_status` stays SELECT-able because the
-- trust badge on listings is meant to be public.
-- ===========================================================================

revoke update (verification_status, id_photo_url, selfie_url)
  on table public.users from authenticated;

revoke select (id_photo_url, selfie_url)
  on table public.users from anon, authenticated;

-- ===========================================================================
-- 5. Guard trigger
-- Column grants are the real protection for the new verification columns
-- (they are simply not granted). The trigger covers is_admin as well so that
-- a future additive GRANT cannot quietly open a privilege-escalation path.
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
       or new.is_founding_host is distinct from old.is_founding_host
       or new.is_admin is distinct from old.is_admin then
      raise exception 'not allowed to change strike, suspension, stripe, founding-host or admin fields directly';
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

-- ===========================================================================
-- 6. submit_verification — the function the docs already described.
-- Security definer so it can write columns the caller has no grant on. The
-- guard trigger still sees auth.role() = 'authenticated' and enforces the
-- transition rule, so this cannot be used to self-approve.
-- ===========================================================================

create or replace function public.submit_verification(
  p_id_photo_url text,
  p_selfie_url text,
  p_consent boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_consent is not true then
    raise exception 'consent is required to submit identity documents';
  end if;

  if coalesce(p_id_photo_url, '') = '' or coalesce(p_selfie_url, '') = '' then
    raise exception 'both an ID document and a selfie are required';
  end if;

  select verification_status into v_status
  from public.users
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  if v_status not in ('unverified', 'rejected') then
    raise exception 'verification cannot be submitted from status %', v_status;
  end if;

  update public.users
  set id_photo_url = p_id_photo_url,
      selfie_url = p_selfie_url,
      verification_status = 'pending',
      verification_method = 'manual',
      verification_submitted_at = now(),
      verification_consent_at = now(),
      verification_rejection_reason = null,
      verification_reviewed_at = null
  where id = auth.uid();

  return 'pending';
end;
$$;

revoke all on function public.submit_verification(text, text, boolean) from public, anon;
grant execute on function public.submit_verification(text, text, boolean) to authenticated;

-- ===========================================================================
-- 7. my_verification — the caller's own verification state.
-- Avoids SELECT-granting a rejection reason or an admin flag on every row,
-- which the public-profile policy would otherwise expose platform-wide.
-- ===========================================================================

create or replace function public.my_verification()
returns table (
  verification_status text,
  verification_method text,
  verification_rejection_reason text,
  verification_submitted_at timestamptz,
  is_admin boolean
)
language sql
security definer
set search_path = public
as $$
  select u.verification_status,
         u.verification_method,
         u.verification_rejection_reason,
         u.verification_submitted_at,
         u.is_admin
  from public.users u
  where u.id = auth.uid();
$$;

revoke all on function public.my_verification() from public, anon;
grant execute on function public.my_verification() to authenticated;

-- ===========================================================================
-- 8. review_verification — service role only, mirrors confirm_paid_booking
-- and apply_host_strike in 00005. Writes the decision and the audit row in
-- one transaction so a review can never be applied without a record.
-- ===========================================================================

create or replace function public.review_verification(
  p_user_id uuid,
  p_decision text,
  p_reason text default null,
  p_method text default 'manual',
  p_reviewer_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;

  if p_decision = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'a rejection reason is required';
  end if;

  if p_method not in ('manual', 'stripe_identity') then
    raise exception 'method must be manual or stripe_identity';
  end if;

  select verification_status into v_status
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user not found';
  end if;

  -- Idempotent: a repeated webhook or a double-clicked button is a no-op.
  if v_status = p_decision then
    return v_status;
  end if;

  update public.users
  set verification_status = p_decision,
      verification_method = p_method,
      verification_reviewed_at = now(),
      verification_rejection_reason = case when p_decision = 'rejected' then p_reason else null end
  where id = p_user_id;

  insert into public.verification_reviews (user_id, reviewer_id, decision, reason, method)
  values (p_user_id, p_reviewer_id, p_decision, p_reason, p_method);

  return p_decision;
end;
$$;

revoke all on function public.review_verification(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.review_verification(uuid, text, text, text, uuid) to service_role;

-- ===========================================================================
-- 9. The gate itself. Until now this lived only in CreateListing.jsx.
-- ===========================================================================

drop policy if exists "Hosts can create listings" on public.listings;
drop policy if exists hosts_create_listings_verified on public.listings;

create policy hosts_create_listings_verified on public.listings
  for insert to authenticated
  with check (
    auth.uid() = host_id
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and verification_status = 'approved'
        and not is_suspended
    )
  );

drop policy if exists "Hosts can create sessions" on public.sessions;
drop policy if exists hosts_create_sessions_verified on public.sessions;

create policy hosts_create_sessions_verified on public.sessions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.listings
      where listings.id = sessions.listing_id
        and listings.host_id = auth.uid()
    )
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and verification_status = 'approved'
        and not is_suspended
    )
  );

-- ===========================================================================
-- 10. verification-docs bucket. These policies existed only in the Dashboard,
-- so nothing about document privacy was auditable from the repository.
-- Clients may write into their own folder and never read: the review UI uses
-- short-lived signed URLs minted with the service role.
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do update set public = false;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'verification_docs_insert_own_folder'
  ) then
    create policy verification_docs_insert_own_folder on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'verification-docs'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  -- The upload path uses upsert, which rewrites an existing object on resubmit.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'verification_docs_update_own_folder'
  ) then
    create policy verification_docs_update_own_folder on storage.objects
      for update to authenticated
      using (
        bucket_id = 'verification-docs'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'verification-docs'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
