-- Marketing email consent and one-tap unsubscribe (DECISIONS.md, 9 November 2026).
--
-- Sign-up has two boxes: an optional, unticked "Allow TryKai to email me new
-- sessions and offers (at most once a week)" above the required Terms box. The choice
-- arrives in the sign-up metadata as marketing_opt_in. Settings can change it
-- later, and every marketing email links to /unsubscribe?t=<token>, which
-- works without signing in.
--
-- Accounts that already exist are opted in (Caleb's decision: early users are
-- the founders' friends). Their source is recorded as 'existing_account' so
-- they can be told apart from people who ticked the box.
--
-- marketing_last_sent_at is for whatever sends marketing email: it should only
-- send to people where it is null or older than 7 days, then set it.
--
-- Additive. Safe to run more than once (the backfill only touches rows never
-- given a choice).

alter table public.users
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists marketing_opt_in_source text,
  add column if not exists marketing_token uuid not null default gen_random_uuid(),
  add column if not exists marketing_last_sent_at timestamptz;

create unique index if not exists users_marketing_token_idx on public.users (marketing_token);

comment on column public.users.marketing_opt_in is
  'Agreed to marketing email. Server only; change through set_marketing_opt_in() or unsubscribe_marketing().';
comment on column public.users.marketing_opt_in_source is
  'signup, settings, unsubscribe or existing_account.';
comment on column public.users.marketing_token is
  'Secret for the one-tap unsubscribe link (/unsubscribe?t=...). Never shown to other users.';

-- Existing accounts, once: anyone with no recorded choice yet.
update public.users
set marketing_opt_in = true,
    marketing_opt_in_at = now(),
    marketing_opt_in_source = 'existing_account'
where marketing_opt_in_source is null;

-- Sign-up: same as 00017 plus marketing_opt_in from the metadata.
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
  v_marketing boolean;
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
  v_marketing := lower(coalesce(new.raw_user_meta_data->>'marketing_opt_in', ''))
    in ('true', 't', '1');

  insert into public.users (
    id, email, full_name, display_name, terms_accepted_at,
    marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source
  )
  values (
    new.id, new.email, v_full_name, v_display_name, v_terms_accepted_at,
    v_marketing, now(), 'signup'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Settings: read and change your own choice.
create or replace function public.my_marketing_opt_in()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.marketing_opt_in from public.users u where u.id = auth.uid()), false);
$$;

revoke all on function public.my_marketing_opt_in() from public, anon;
grant execute on function public.my_marketing_opt_in() to authenticated;

create or replace function public.set_marketing_opt_in(p_opt_in boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  update public.users
  set marketing_opt_in = coalesce(p_opt_in, false),
      marketing_opt_in_at = now(),
      marketing_opt_in_source = 'settings'
  where id = auth.uid();
  return coalesce(p_opt_in, false);
end;
$$;

revoke all on function public.set_marketing_opt_in(boolean) from public, anon;
grant execute on function public.set_marketing_opt_in(boolean) to authenticated;

-- One-tap unsubscribe from an email, signed in or not. The token is a random
-- uuid per user, so it cannot be guessed. Returns false for an unknown token.
create or replace function public.unsubscribe_marketing(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  update public.users
  set marketing_opt_in = false,
      marketing_opt_in_at = now(),
      marketing_opt_in_source = 'unsubscribe'
  where marketing_token = p_token
  returning true into v_found;
  return coalesce(v_found, false);
end;
$$;

revoke all on function public.unsubscribe_marketing(uuid) from public;
grant execute on function public.unsubscribe_marketing(uuid) to anon, authenticated;
