-- Caller-scoped founding-host flag for the listing price hint.
--
-- 00005 never granted SELECT on users.is_founding_host (and must not:
-- the public-profile policy is USING (true)). CreateListing and
-- EditListing used to ask for that column and fail the whole users
-- row. This function returns only auth.uid()'s own boolean.
--
-- Safe to run more than once.

create or replace function public.my_is_founding_host()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select u.is_founding_host
  from public.users u
  where u.id = auth.uid();
$$;

revoke all on function public.my_is_founding_host() from public, anon;
grant execute on function public.my_is_founding_host() to authenticated;
