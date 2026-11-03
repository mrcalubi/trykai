-- Guest review photos. Paths, not URLs: the trigger can check storage.objects
-- by name, and a CDN or bucket move does not rewrite rows. Same idea as
-- booking_complaints.photo_paths.
--
-- The bucket is insert-only. Reviews cannot be edited, so a posted photo must
-- not be replaceable or deletable by the client. Failed reviews may leave
-- orphan objects; they are public but unreferenced and can be cleared by hand.
--
-- Apply on staging before merging the review-photos PR.

alter table public.reviews
  add column if not exists photo_paths text[] not null default '{}';

alter table public.reviews
  drop constraint if exists reviews_photo_paths_len;

alter table public.reviews
  add constraint reviews_photo_paths_len check (cardinality(photo_paths) <= 3);

create or replace function public.reviews_guard_photo_paths()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  photo_path text;
begin
  if new.photo_paths is null then
    new.photo_paths := '{}';
  end if;

  -- Only check paths when they change. Any other update (a future
  -- anonymisation of reviewer_id, an admin fix) must not fail because an
  -- object was removed out of order.
  if tg_op = 'UPDATE' and new.photo_paths is not distinct from old.photo_paths then
    return new;
  end if;

  foreach photo_path in array new.photo_paths
  loop
    if photo_path is null
      or photo_path !~ ('^' || new.reviewer_id::text || '/[A-Za-z0-9._-]+$')
      or not exists (
        select 1
        from storage.objects
        where bucket_id = 'review-photos'
          and name = photo_path
      )
    then
      raise exception 'Review photos must be objects in this reviewer''s review-photos folder.';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists reviews_guard_photo_paths on public.reviews;
create trigger reviews_guard_photo_paths
  before insert or update on public.reviews
  for each row
  execute function public.reviews_guard_photo_paths();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-photos',
  'review-photos',
  true,
  3145728,
  array['image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ~ 'review-photos'
        or coalesce(with_check, '') ~ 'review-photos'
        or policyname ilike '%review-photos%'
        or policyname ilike '%review_photos%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy review_photos_insert_own_folder on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Return type gains photo_paths, so drop and recreate, then restore grants
-- exactly as 00014 left them.
drop function if exists public.reviews_for_listing(uuid);
drop function if exists public.reviews_for_host(uuid);

create function public.reviews_for_host(p_host_id uuid)
returns table (
  id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  listing_title text,
  photo_paths text[],
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
    r.photo_paths,
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

create function public.reviews_for_listing(p_listing_id uuid)
returns table (
  id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  photo_paths text[],
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
    r.photo_paths,
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
