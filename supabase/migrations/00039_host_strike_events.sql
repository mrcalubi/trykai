-- Host strikes as dated events that expire after 12 months (DECISIONS.md,
-- 25 October 2026).
--
-- Today users.host_strikes is a counter. apply_host_strike (00005) adds 1
-- and deactivates every listing at 3. Strikes never expire. This migration
-- keeps the counter in step as the active count so nothing old reads a
-- wrong number, and my_account() computes the active count live.
--
-- An active strike is: removed_at is null and created_at is within the
-- last 12 months. Expiry never reactivates listings by itself; the team
-- does that after a review.
--
-- Backfill: each user with host_strikes > 0 gets that many 'admin' events
-- dated at migration time. Expiry runs from the migration, not earlier.
--
-- Clients have no table access and cannot execute the strike functions.
-- Safe to run more than once.

create table if not exists public.host_strike_events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  reason text not null default 'host_cancel'
    check (reason in ('host_cancel', 'no_show', 'admin')),
  session_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_note text
);

create index if not exists host_strike_events_host_created_idx
  on public.host_strike_events (host_id, created_at desc);

comment on table public.host_strike_events is
  'One row per host strike. Active when removed_at is null and created_at is within 12 months. Service role only.';

alter table public.host_strike_events enable row level security;

revoke all on table public.host_strike_events from public, anon, authenticated;
grant all on table public.host_strike_events to service_role;

create or replace function public.host_active_strike_count(p_host_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.host_strike_events
  where host_id = p_host_id
    and removed_at is null
    and created_at >= now() - interval '12 months';
$$;

revoke all on function public.host_active_strike_count(uuid) from public, anon, authenticated;
grant execute on function public.host_active_strike_count(uuid) to service_role;

-- Replace the 00005 counter. Optional reason and session; cancel-booking
-- passes p_session_id so the event links to the cancelled session.
drop function if exists public.apply_host_strike(uuid);

create or replace function public.apply_host_strike(
  p_host_id uuid,
  p_reason text default 'host_cancel',
  p_session_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'host_cancel');
  v_strikes integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  if v_reason not in ('host_cancel', 'no_show', 'admin') then
    raise exception 'reason must be host_cancel, no_show, or admin';
  end if;

  if not exists (select 1 from public.users where id = p_host_id) then
    raise exception 'host not found';
  end if;

  insert into public.host_strike_events (host_id, reason, session_id)
  values (p_host_id, v_reason, p_session_id);

  v_strikes := public.host_active_strike_count(p_host_id);

  update public.users
  set host_strikes = v_strikes
  where id = p_host_id;

  if v_strikes >= 3 then
    update public.listings
    set is_active = false
    where host_id = p_host_id;
  end if;

  return v_strikes;
end;
$$;

revoke all on function public.apply_host_strike(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_host_strike(uuid, text, uuid) to service_role;

create or replace function public.admin_remove_host_strike(p_event_id uuid, p_note text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_host_id uuid;
  v_strikes integer;
begin
  -- Run from the SQL Editor only. Clients have no EXECUTE grant, so the
  -- is_admin branch never runs (current_user is the owner here). postgres
  -- and service_role are the paths that actually succeed.
  if auth.role() is distinct from 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and not exists (
       select 1 from public.users
       where id = auth.uid() and is_admin is true
     )
  then
    raise exception 'not allowed';
  end if;

  if v_note is null then
    raise exception 'a note is required';
  end if;

  select host_id into v_host_id
  from public.host_strike_events
  where id = p_event_id
    and removed_at is null
  for update;

  if not found then
    raise exception 'strike not found';
  end if;

  update public.host_strike_events
  set removed_at = now(),
      removed_note = v_note
  where id = p_event_id;

  v_strikes := public.host_active_strike_count(v_host_id);

  update public.users
  set host_strikes = v_strikes
  where id = v_host_id;

  return v_strikes;
end;
$$;

revoke all on function public.admin_remove_host_strike(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_remove_host_strike(uuid, text) to service_role;

create or replace function public.my_account()
returns table (
  email text,
  full_name text,
  phone text,
  display_name text,
  bio text,
  avatar_url text,
  is_host boolean,
  verification_status text,
  stripe_payouts_enabled boolean,
  host_strikes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select u.email,
         u.full_name,
         u.phone,
         u.display_name,
         u.bio,
         u.avatar_url,
         u.is_host,
         u.verification_status,
         u.stripe_payouts_enabled,
         public.host_active_strike_count(u.id)
  from public.users u
  where u.id = auth.uid();
$$;

revoke all on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

insert into public.host_strike_events (host_id, reason, created_at)
select u.id, 'admin', now()
from public.users u
cross join generate_series(1, u.host_strikes)
where coalesce(u.host_strikes, 0) > 0
  and not exists (
    select 1 from public.host_strike_events e where e.host_id = u.id
  );
