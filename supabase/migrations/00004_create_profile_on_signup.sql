-- Create public.users in the same transaction as auth.users, so signup does
-- not depend on an immediate client insert with a brand-new JWT.
-- That insert is what failed on production with "JWT issued at future"
-- (clock skew between Auth and PostgREST).
-- Safe to run more than once.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Repair auth accounts that never got a public.users row (including signups
-- that already hit the JWT clock-skew failure).
insert into public.users (id, email, full_name)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(u.email, '@', 1)
  )
from auth.users u
where not exists (
  select 1 from public.users p where p.id = u.id
);
