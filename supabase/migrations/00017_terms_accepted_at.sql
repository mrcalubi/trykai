-- Record Terms and Privacy agreement at signup.
--
-- terms_accepted_at is set by handle_new_user when signup metadata
-- includes terms_accepted = true. Existing rows stay null (they did not
-- go through this checkbox). No SELECT or UPDATE grant to anon or
-- authenticated; column-level grants from 00005/00014 do not include it.
-- guard_user_self_update blocks a later additive GRANT.
--
-- Safe to run more than once. CREATE OR REPLACE of handle_new_user
-- preserves the auth.users trigger from 00004.

alter table public.users
  add column if not exists terms_accepted_at timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_display_name text;
  v_terms_accepted_at timestamptz;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_display_name := left(
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif((regexp_split_to_array(btrim(v_full_name), '\s+'))[1], ''),
      'Guest'
    ),
    40
  );
  v_terms_accepted_at := case
    when lower(coalesce(new.raw_user_meta_data->>'terms_accepted', ''))
      in ('true', 't', '1')
    then now()
    else null
  end;

  insert into public.users (id, email, full_name, display_name, terms_accepted_at)
  values (new.id, new.email, v_full_name, v_display_name, v_terms_accepted_at)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

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
       or new.is_admin is distinct from old.is_admin
       or new.terms_accepted_at is distinct from old.terms_accepted_at then
      raise exception 'not allowed to change strike, suspension, stripe, founding-host, admin or terms-accepted fields directly';
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
