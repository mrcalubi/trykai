-- Two-way reviews with a blind 7-day reveal (DECISIONS.md, 3 November 2026).
-- Hosts review guests. Both sides stay hidden until both have posted, or until
-- 7 days after the session ends. Guest stars stay private (TryKai and
-- milestones only). Host reviews of a guest are public as words only.
--
-- Apply on staging, then on production, BEFORE merging the two-way-reviews
-- release. Do not apply 00049 until that release is live on production.
--
-- Safe to run more than once. DROP of RETURNS TABLE functions is required
-- when the shape changes; grants are restored exactly as the last writer
-- left them (00014 for reviews_for_*; 00015 for listing_ratings; 00041 for
-- my_profile_stats).

-- ---------------------------------------------------------------------------
-- 1. Reveal columns. Existing reviews stay live.
-- ---------------------------------------------------------------------------

alter table public.reviews
  add column if not exists reveal_after timestamptz,
  add column if not exists revealed_at timestamptz,
  add column if not exists other_party_emailed_at timestamptz;

-- Only rows that never received a reveal_after (the live site before 00048).
-- A re-run must not stamp revealed_at on reviews still in the 7-day window.
update public.reviews
set
  reveal_after = created_at,
  revealed_at = created_at
where reveal_after is null;

-- One function every reader uses. A row is public once revealed_at is set
-- (both sides posted) or the 7-day window has passed.
create or replace function public.review_is_public(r public.reviews)
returns boolean
language sql
stable
as $$
  select r.revealed_at is not null or now() >= r.reveal_after;
$$;

comment on function public.review_is_public(public.reviews) is
  'True when this review is visible: revealed_at is set, or now() >= reveal_after.';

revoke all on function public.review_is_public(public.reviews) from public;
grant execute on function public.review_is_public(public.reviews) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Uniqueness: one guest review per booking; one host review per person
--    on a booking (companions can be added later without a migration).
-- ---------------------------------------------------------------------------

alter table public.reviews drop constraint if exists reviews_booking_id_role_key;

drop index if exists public.reviews_one_guest_per_booking;
create unique index reviews_one_guest_per_booking
  on public.reviews (booking_id)
  where role = 'guest';

drop index if exists public.reviews_one_host_per_guest_per_booking;
create unique index reviews_one_host_per_guest_per_booking
  on public.reviews (booking_id, reviewee_id)
  where role = 'host';

-- ---------------------------------------------------------------------------
-- 3. BEFORE INSERT: session end + 7 days. Clients cannot set reveal columns.
-- ---------------------------------------------------------------------------

create or replace function public.reviews_assign_reveal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_end timestamptz;
begin
  new.revealed_at := null;
  new.other_party_emailed_at := null;

  select
    s.starts_at + (
      coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute'
    ) + interval '7 days'
  into v_session_end
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  where b.id = new.booking_id;

  if v_session_end is null then
    raise exception 'not_allowed';
  end if;

  new.reveal_after := v_session_end;
  return new;
end;
$$;

drop trigger if exists reviews_assign_reveal on public.reviews;
create trigger reviews_assign_reveal
  before insert on public.reviews
  for each row
  execute function public.reviews_assign_reveal();

-- ---------------------------------------------------------------------------
-- 4. AFTER INSERT: if both sides of this pair exist, reveal both, under a
--    lock on the booking so two simultaneous posts cannot both miss.
-- ---------------------------------------------------------------------------

create or replace function public.reviews_reveal_when_both()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_host_id uuid;
  v_guest_review uuid;
  v_host_review uuid;
begin
  perform 1 from public.bookings where id = new.booking_id for update;

  select b.guest_id, l.host_id
  into v_guest_id, v_host_id
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  where b.id = new.booking_id;

  if v_guest_id is null or v_host_id is null then
    return new;
  end if;

  select r.id
  into v_guest_review
  from public.reviews r
  where r.booking_id = new.booking_id
    and r.role = 'guest'
    and r.reviewee_id = v_host_id;

  select r.id
  into v_host_review
  from public.reviews r
  where r.booking_id = new.booking_id
    and r.role = 'host'
    and r.reviewee_id = v_guest_id;

  if v_guest_review is not null and v_host_review is not null then
    update public.reviews
    set revealed_at = now()
    where id in (v_guest_review, v_host_review)
      and revealed_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_reveal_when_both on public.reviews;
create trigger reviews_reveal_when_both
  after insert on public.reviews
  for each row
  execute function public.reviews_reveal_when_both();

-- ---------------------------------------------------------------------------
-- 5. Private notes. TryKai only. No client policies or grants.
-- ---------------------------------------------------------------------------

create table if not exists public.review_notes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  constraint review_notes_note_len check (char_length(note) between 1 and 2000)
);

alter table public.review_notes enable row level security;

revoke all on table public.review_notes from public, anon, authenticated;
grant select, update on table public.review_notes to service_role;

-- ---------------------------------------------------------------------------
-- 6. post_review. Role is derived from auth.uid(), never passed.
-- ---------------------------------------------------------------------------

create or replace function public.post_review(
  p_booking_id uuid,
  p_reviewee_id uuid,
  p_rating integer,
  p_comment text,
  p_photo_paths text[],
  p_private_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_guest_id uuid;
  v_host_id uuid;
  v_status text;
  v_session_end timestamptz;
  v_role text;
  v_comment text;
  v_photos text[] := coalesce(p_photo_paths, '{}');
  v_note text;
  v_review_id uuid;
  v_revealed boolean;
  v_reveal_after timestamptz;
begin
  if v_uid is null then
    raise exception 'not_allowed';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'not_allowed';
  end if;

  select b.guest_id, b.status, l.host_id,
    s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute')
  into v_guest_id, v_status, v_host_id, v_session_end
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  where b.id = p_booking_id;

  if v_guest_id is null or v_host_id is null then
    raise exception 'not_allowed';
  end if;

  if v_status is distinct from 'confirmed' then
    raise exception 'not_allowed';
  end if;

  if now() <= v_session_end then
    raise exception 'not_allowed';
  end if;

  if now() >= v_session_end + interval '7 days' then
    raise exception 'review_window_closed';
  end if;

  if v_uid = v_guest_id and p_reviewee_id = v_host_id then
    v_role := 'guest';
    v_comment := nullif(btrim(coalesce(p_comment, '')), '');
  elsif v_uid = v_host_id and p_reviewee_id = v_guest_id then
    v_role := 'host';
    v_comment := btrim(coalesce(p_comment, ''));
    if char_length(v_comment) < 10 or char_length(v_comment) > 1000 then
      raise exception 'not_allowed';
    end if;
    if cardinality(v_photos) <> 0 then
      raise exception 'not_allowed';
    end if;
  else
    raise exception 'not_allowed';
  end if;

  if exists (
    select 1
    from public.reviews r
    where r.booking_id = p_booking_id
      and r.reviewer_id = v_uid
      and r.role = v_role
      and (v_role = 'guest' or r.reviewee_id = p_reviewee_id)
  ) then
    raise exception 'already_reviewed';
  end if;

  insert into public.reviews (
    booking_id, reviewer_id, reviewee_id, rating, comment, role, photo_paths
  ) values (
    p_booking_id, v_uid, p_reviewee_id, p_rating, v_comment, v_role, v_photos
  )
  returning id into v_review_id;

  v_note := nullif(btrim(coalesce(p_private_note, '')), '');
  if v_note is not null then
    if char_length(v_note) > 2000 then
      raise exception 'not_allowed';
    end if;
    insert into public.review_notes (review_id, booking_id, author_id, note)
    values (v_review_id, p_booking_id, v_uid, v_note);
  end if;

  select r.reveal_after, public.review_is_public(r)
  into v_reveal_after, v_revealed
  from public.reviews r
  where r.id = v_review_id;

  return jsonb_build_object(
    'review_id', v_review_id,
    'revealed', coalesce(v_revealed, false),
    'reveal_after', v_reveal_after
  );
exception
  when unique_violation then
    raise exception 'already_reviewed';
end;
$$;

comment on function public.post_review(uuid, uuid, integer, text, text[], text) is
  'Authenticated guest or host posts a review. Role is derived. Raises already_reviewed, review_window_closed, or not_allowed.';

revoke all on function public.post_review(uuid, uuid, integer, text, text[], text) from public, anon;
grant execute on function public.post_review(uuid, uuid, integer, text, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Readers. Drop and recreate where the return type changes, then restore
--    grants exactly as before.
-- ---------------------------------------------------------------------------

drop function if exists public.reviews_for_listing(uuid);
drop function if exists public.reviews_for_host(uuid);

create function public.reviews_for_host(p_host_id uuid)
returns table (
  id uuid,
  reviewer_id uuid,
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
    r.reviewer_id,
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
    and public.review_is_public(r)
  order by r.created_at desc;
$$;

revoke all on function public.reviews_for_host(uuid) from public;
grant execute on function public.reviews_for_host(uuid) to anon, authenticated;

create function public.reviews_for_listing(p_listing_id uuid)
returns table (
  id uuid,
  reviewer_id uuid,
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
    r.reviewer_id,
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
    and public.review_is_public(r)
  order by r.created_at desc;
$$;

revoke all on function public.reviews_for_listing(uuid) from public;
grant execute on function public.reviews_for_listing(uuid) to anon, authenticated;

create or replace function public.listing_ratings(listing_ids uuid[])
returns table (
  listing_id uuid,
  average numeric,
  review_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.listing_id,
    avg(r.rating)::numeric as average,
    count(*)::integer as review_count
  from public.reviews r
  join public.bookings b on b.id = r.booking_id
  join public.sessions s on s.id = b.session_id
  where s.listing_id = any(listing_ids)
    and r.role = 'guest'
    and public.review_is_public(r)
  group by s.listing_id;
$$;

revoke all on function public.listing_ratings(uuid[]) from public;
grant execute on function public.listing_ratings(uuid[]) to anon, authenticated;

create or replace function public.host_rating(p_host_id uuid)
returns table (
  average numeric,
  review_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    avg(r.rating)::numeric as average,
    count(*)::integer as review_count
  from public.reviews r
  where r.reviewee_id = p_host_id
    and r.role = 'guest'
    and public.review_is_public(r);
$$;

comment on function public.host_rating(uuid) is
  'Public guest-review average and count for this host, across listings.';

revoke all on function public.host_rating(uuid) from public;
grant execute on function public.host_rating(uuid) to anon, authenticated;

create or replace function public.reviews_for_guest(p_guest_id uuid)
returns table (
  id uuid,
  comment text,
  created_at timestamptz,
  listing_title text,
  host_id uuid,
  host_display_name text,
  host_avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.comment,
    r.created_at,
    l.title as listing_title,
    l.host_id,
    u.display_name as host_display_name,
    u.avatar_url as host_avatar_url
  from public.reviews r
  join public.bookings b on b.id = r.booking_id
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  left join public.users u on u.id = r.reviewer_id
  where r.reviewee_id = p_guest_id
    and r.role = 'host'
    and public.review_is_public(r)
  order by r.created_at desc;
$$;

comment on function public.reviews_for_guest(uuid) is
  'Public host reviews of this guest. Words only; never rating.';

revoke all on function public.reviews_for_guest(uuid) from public;
grant execute on function public.reviews_for_guest(uuid) to anon, authenticated;

create or replace function public.my_review_state(p_booking_id uuid)
returns table (
  can_review boolean,
  deadline timestamptz,
  i_reviewed boolean,
  my_review_public boolean,
  other_side_reviewed boolean,
  reveal_after timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_guest_id uuid;
  v_host_id uuid;
  v_status text;
  v_session_end timestamptz;
  v_deadline timestamptz;
  v_as_guest boolean;
  v_as_host boolean;
  v_mine public.reviews;
  v_other public.reviews;
begin
  if v_uid is null then
    return;
  end if;

  select b.guest_id, b.status, l.host_id,
    s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute')
  into v_guest_id, v_status, v_host_id, v_session_end
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  where b.id = p_booking_id;

  if v_guest_id is null then
    return;
  end if;

  v_deadline := v_session_end + interval '7 days';
  v_as_guest := v_uid = v_guest_id;
  v_as_host := v_uid = v_host_id;

  if v_as_guest then
    select r.* into v_mine
    from public.reviews r
    where r.booking_id = p_booking_id
      and r.role = 'guest'
      and r.reviewer_id = v_uid;

    select r.* into v_other
    from public.reviews r
    where r.booking_id = p_booking_id
      and r.role = 'host'
      and r.reviewee_id = v_guest_id;
  elsif v_as_host then
    select r.* into v_mine
    from public.reviews r
    where r.booking_id = p_booking_id
      and r.role = 'host'
      and r.reviewer_id = v_uid
      and r.reviewee_id = v_guest_id;

    select r.* into v_other
    from public.reviews r
    where r.booking_id = p_booking_id
      and r.role = 'guest'
      and r.reviewee_id = v_host_id;
  else
    can_review := false;
    deadline := v_deadline;
    i_reviewed := false;
    my_review_public := false;
    other_side_reviewed := false;
    reveal_after := null;
    return next;
    return;
  end if;

  can_review := v_status = 'confirmed'
    and now() > v_session_end
    and now() < v_deadline
    and v_mine.id is null;
  deadline := v_deadline;
  i_reviewed := v_mine.id is not null;
  my_review_public := v_mine.id is not null and public.review_is_public(v_mine);
  other_side_reviewed := v_other.id is not null;
  reveal_after := coalesce(v_mine.reveal_after, v_deadline);
  return next;
end;
$$;

comment on function public.my_review_state(uuid) is
  'Caller as guest or host: whether they can review this booking, and whether the other side has posted (boolean only).';

revoke all on function public.my_review_state(uuid) from public, anon;
grant execute on function public.my_review_state(uuid) to authenticated;

create or replace function public.host_reviews_due()
returns table (
  booking_id uuid,
  guest_id uuid,
  guest_display_name text,
  guest_avatar_url text,
  listing_title text,
  starts_at timestamptz,
  deadline timestamptz,
  host_reviewed boolean,
  guest_reviewed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id as booking_id,
    b.guest_id,
    u.display_name as guest_display_name,
    u.avatar_url as guest_avatar_url,
    l.title as listing_title,
    s.starts_at,
    (
      s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute') + interval '7 days'
    ) as deadline,
    exists (
      select 1
      from public.reviews hr
      where hr.booking_id = b.id
        and hr.role = 'host'
        and hr.reviewee_id = b.guest_id
        and hr.reviewer_id = auth.uid()
    ) as host_reviewed,
    exists (
      select 1
      from public.reviews gr
      where gr.booking_id = b.id
        and gr.role = 'guest'
        and gr.reviewee_id = l.host_id
    ) as guest_reviewed
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  left join public.users u on u.id = b.guest_id
  where l.host_id = auth.uid()
    and b.status = 'confirmed'
    and now() > s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute')
    and now() < s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute') + interval '7 days'
  order by s.starts_at desc, b.created_at desc;
$$;

comment on function public.host_reviews_due() is
  'Confirmed bookings of the calling host whose session ended less than 7 days ago.';

revoke all on function public.host_reviews_due() from public, anon;
grant execute on function public.host_reviews_due() to authenticated;

drop function if exists public.my_profile_stats();

create function public.my_profile_stats()
returns table (
  guests_hosted integer,
  repeat_guests integer,
  sessions_attended integer,
  categories_tried integer,
  reviews_written integer,
  joined_at timestamptz,
  host_reviews_received integer,
  host_five_star_received integer,
  guests_reviewed integer
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
    (select u.created_at from public.users u where u.id = auth.uid()),
    (
      select count(*)::integer
      from public.reviews r
      where r.reviewee_id = auth.uid()
        and r.role = 'host'
        and public.review_is_public(r)
    ),
    (
      select count(*)::integer
      from public.reviews r
      where r.reviewee_id = auth.uid()
        and r.role = 'host'
        and r.rating = 5
        and public.review_is_public(r)
    ),
    (
      select count(*)::integer
      from public.reviews r
      where r.reviewer_id = auth.uid()
        and r.role = 'host'
    )
  where auth.uid() is not null;
$$;

comment on function public.my_profile_stats() is
  'Counts for the signed-in user only: guests hosted, repeat guests, sessions attended, categories tried, reviews written, join date, public host reviews received, public five-star host reviews, guests reviewed.';

revoke all on function public.my_profile_stats() from public, anon;
grant execute on function public.my_profile_stats() to authenticated;

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
         and public.review_is_public(r)
     ) then
    raise exception 'featured review must be a guest review of this profile';
  end if;
  return new;
end;
$$;
