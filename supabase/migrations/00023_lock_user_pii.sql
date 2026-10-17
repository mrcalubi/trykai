-- Stop dumping PII through /rest/v1/users.
--
-- 00001's "Anyone can view host profiles" is USING (true). Combined with
-- the 00005 SELECT grant, anon and authenticated could read every user's
-- email, full_name, phone, and more. Column grants are table-wide, so
-- own-row-only access to those fields has to be a security-definer RPC.
-- RLS is unchanged.
--
-- Safe to run more than once.

alter table public.users
  add column if not exists is_id_verified boolean
  generated always as (verification_status = 'approved') stored;

grant select (is_id_verified) on table public.users to anon, authenticated;

revoke select (
  email, full_name, phone, phone_verified, host_strikes, created_at, verification_status
) on table public.users from anon, authenticated;

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
         u.host_strikes
  from public.users u
  where u.id = auth.uid();
$$;

revoke all on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;
