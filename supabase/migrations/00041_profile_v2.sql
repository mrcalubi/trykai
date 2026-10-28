-- Profile v2: banner, socials, featured review, public founding badge and
-- owner-only profile stats (DECISIONS.md, 27 October 2026).
--
-- 1. New public profile columns on users. SELECT to anon and
--    authenticated, UPDATE to authenticated, same as bio (00021).
--    guard_user_self_update (last rewritten in 00017) does not inspect
--    them, so the granted UPDATE is allowed.
--      banner_preset       one of seven TryKai colours, or null (sand)
--      banner_url          an uploaded banner, only from this user's own
--                          folder in the listing-photos bucket
--      featured_review_id  a guest review of this user, checked by trigger
--      instagram_handle    handle only, no @ and no URL
--      tiktok_handle       handle only, no @ and no URL
-- 2. host_is_founding(p_host_id) returns only the boolean, so profiles can
--    show the Founding host pill. users.is_founding_host itself stays
--    unreadable: 00005 keeps it off the public column grant, and this
--    function returns nothing about fees.
-- 3. my_profile_stats() returns counts for auth.uid() only: guests hosted,
--    repeat guests, sessions attended, categories tried, reviews written
--    and the join date. Bookings stay guest/host only; nobody can ask for
--    someone else's numbers.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists banner_preset text,
  add column if not exists banner_url text,
  add column if not exists featured_review_id uuid,
  add column if not exists instagram_handle text,
  add column if not exists tiktok_handle text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_featured_review_id_fkey'
  ) then
    alter table public.users
      add constraint users_featured_review_id_fkey
      foreign key (featured_review_id) references public.reviews(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_banner_preset_check'
  ) then
    alter table public.users
      add constraint users_banner_preset_check
      check (
        banner_preset is null
        or banner_preset in ('coral', 'sand', 'sky', 'mint', 'lilac', 'navy', 'clay')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_banner_url_check'
  ) then
    alter table public.users
      add constraint users_banner_url_check
      check (
        banner_url is null
        or (
          char_length(banner_url) <= 1000
          and banner_url like 'https://%'
          and strpos(
            banner_url,
            '/storage/v1/object/public/listing-photos/' || id::text || '/banner-'
          ) > 0
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_instagram_handle_check'
  ) then
    alter table public.users
      add constraint users_instagram_handle_check
      check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_tiktok_handle_check'
  ) then
    alter table public.users
      add constraint users_tiktok_handle_check
      check (tiktok_handle is null or tiktok_handle ~ '^[A-Za-z0-9._]{2,24}$');
  end if;
end $$;

grant select (banner_preset, banner_url, featured_review_id, instagram_handle, tiktok_handle)
  on table public.users to anon, authenticated;
grant update (banner_preset, banner_url, featured_review_id, instagram_handle, tiktok_handle)
  on table public.users to authenticated;

-- A featured review must be a guest's review of this user.
create or replace function public.guard_featured_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.featured_review_id is not null
     and new.featured_review_id is distinct from old.featured_review_id
     and not exists (
       select 1
       from public.reviews r
       where r.id = new.featured_review_id
         and r.reviewee_id = new.id
         and r.role = 'guest'
     ) then
    raise exception 'featured review must be a guest review of this profile';
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_featured_review on public.users;
create trigger users_guard_featured_review
  before update of featured_review_id on public.users
  for each row execute function public.guard_featured_review();

-- ---------------------------------------------------------------------------
-- 2. Founding host pill
-- ---------------------------------------------------------------------------

create or replace function public.host_is_founding(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select u.is_founding_host and coalesce(u.is_host, false)
    from public.users u
    where u.id = p_host_id
  ), false);
$$;

comment on function public.host_is_founding(uuid) is
  'True when this user is a host with the founding flag. Boolean only.';

revoke all on function public.host_is_founding(uuid) from public;
grant execute on function public.host_is_founding(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Owner-only profile stats
-- ---------------------------------------------------------------------------

create or replace function public.my_profile_stats()
returns table (
  guests_hosted integer,
  repeat_guests integer,
  sessions_attended integer,
  categories_tried integer,
  reviews_written integer,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with hosted as (
    select b.guest_id, b.session_id, coalesce(b.guests_count, 1) as guests
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    join public.listings l on l.id = s.listing_id
    where l.host_id = auth.uid()
      and b.status = 'confirmed'
      and s.starts_at + make_interval(mins => coalesce(s.duration_mins, 60)) < now()
  ),
  per_guest as (
    select h.guest_id, count(distinct h.session_id) as sessions
    from hosted h
    group by h.guest_id
  ),
  attended as (
    select b.session_id, l.category
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    join public.listings l on l.id = s.listing_id
    where b.guest_id = auth.uid()
      and b.status = 'confirmed'
      and s.starts_at + make_interval(mins => coalesce(s.duration_mins, 60)) < now()
  )
  select
    (select coalesce(sum(h.guests), 0)::integer from hosted h),
    (select count(*)::integer from per_guest p where p.sessions >= 2),
    (select count(distinct a.session_id)::integer from attended a),
    (select count(distinct a.category)::integer from attended a where a.category is not null),
    (
      select count(*)::integer
      from public.reviews r
      where r.reviewer_id = auth.uid()
        and r.role = 'guest'
    ),
    (select u.created_at from public.users u where u.id = auth.uid())
  where auth.uid() is not null;
$$;

comment on function public.my_profile_stats() is
  'Counts for the signed-in user only: guests hosted, repeat guests, sessions attended, categories tried, reviews written, join date.';

revoke all on function public.my_profile_stats() from public, anon;
grant execute on function public.my_profile_stats() to authenticated;
