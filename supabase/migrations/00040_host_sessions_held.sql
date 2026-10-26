-- Public count of a host's finished sessions that had guests
-- (DECISIONS.md, 26 October 2026).
--
-- The profile header shows "Sessions held" to anyone, including
-- signed-out visitors. Clients must not read bookings to compute it:
-- bookings are guest/host only. This function returns only the integer.
--
-- A session is held when it has ended (starts_at + duration_mins is in
-- the past) and at least one booking on it is confirmed. Cancelled
-- bookings do not count. Return 0 when p_host_id is null.
--
-- Safe to run more than once.

create or replace function public.host_sessions_held(p_host_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select count(*)::integer
    from public.sessions s
    join public.listings l on l.id = s.listing_id
    where l.host_id = p_host_id
      and s.starts_at + make_interval(mins => coalesce(s.duration_mins, 60)) < now()
      and exists (
        select 1
        from public.bookings b
        where b.session_id = s.id
          and b.status = 'confirmed'
      )
  ), 0);
$$;

comment on function public.host_sessions_held(uuid) is
  'Count of this host''s ended sessions that had at least one confirmed booking. Integer only.';

revoke all on function public.host_sessions_held(uuid) from public;
grant execute on function public.host_sessions_held(uuid) to anon, authenticated;
