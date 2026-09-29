-- Public surfaces show a chosen display name, not a split of full_name.
--
-- display_name is trimmed, 1 to 40 characters. Existing rows are backfilled
-- from the first word of full_name. handle_new_user reads it from signup
-- metadata and falls back to that same first word.
--
-- Column grants follow 00005: SELECT to anon and authenticated, UPDATE to
-- authenticated. guard_user_self_update (00007) does not inspect
-- display_name, so the granted UPDATE is allowed.
--
-- reviews_for_listing and reviews_for_host return display_name in jsonb
-- users.full_name so ReviewCard keeps its shape.
--
-- Safe to run more than once. Does not edit 00013.

alter table public.users
  add column if not exists display_name text;

update public.users
set display_name = left(
  coalesce(
    nullif((regexp_split_to_array(btrim(full_name), '\s+'))[1], ''),
    nullif(left(split_part(email, '@', 1), 40), ''),
    'Guest'
  ),
  40
)
where display_name is null
   or btrim(display_name) = '';

update public.users
set display_name = left(btrim(display_name), 40)
where display_name is distinct from left(btrim(display_name), 40);

alter table public.users
  alter column display_name set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_display_name_check'
  ) then
    alter table public.users
      add constraint users_display_name_check
      check (
        char_length(display_name) between 1 and 40
        and display_name = btrim(display_name)
      );
  end if;
end $$;

grant select (display_name) on table public.users to anon, authenticated;
grant update (display_name) on table public.users to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_display_name text;
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

  insert into public.users (id, email, full_name, display_name)
  values (new.id, new.email, v_full_name, v_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.reviews_for_host(p_host_id uuid)
returns table (
  id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  listing_title text,
  users jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.rating,
    r.comment,
    r.created_at,
    l.title as listing_title,
    jsonb_build_object('full_name', u.display_name) as users
  from public.reviews r
  join public.bookings b on b.id = r.booking_id
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  left join public.users u on u.id = r.reviewer_id
  where r.reviewee_id = p_host_id
    and r.role = 'guest'
    and l.host_id = p_host_id
  order by r.created_at desc;
$$;

revoke all on function public.reviews_for_host(uuid) from public;
grant execute on function public.reviews_for_host(uuid) to anon, authenticated;

create or replace function public.reviews_for_listing(p_listing_id uuid)
returns table (
  id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  users jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.rating,
    r.comment,
    r.created_at,
    jsonb_build_object('full_name', u.display_name) as users
  from public.reviews r
  join public.bookings b on b.id = r.booking_id
  join public.sessions s on s.id = b.session_id
  left join public.users u on u.id = r.reviewer_id
  where s.listing_id = p_listing_id
    and r.role = 'guest'
  order by r.created_at desc;
$$;

revoke all on function public.reviews_for_listing(uuid) from public;
grant execute on function public.reviews_for_listing(uuid) to anon, authenticated;
