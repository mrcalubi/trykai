-- Host replies to reviews (DECISIONS.md, 10 November 2026).
--
-- A host can post one short public reply under each guest review of their
-- sessions, once that review is public (two-way reviews, 00048). The reply
-- shows under the review on the listing page and on the host's profile. The
-- host can edit or delete it. Guests cannot reply back; this is a reply, not
-- a thread.
--
-- Replies live in their own table so the existing review readers
-- (reviews_for_host, reviews_for_listing) keep their return types. Pages ask
-- review_replies() for the reviews they already show.
--
-- No client grants on the table: everything goes through the functions below.
--
-- Additive. Safe to run more than once.

create table if not exists public.review_replies (
  review_id uuid primary key references public.reviews (id) on delete cascade,
  host_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.review_replies enable row level security;
revoke all on table public.review_replies from public, anon, authenticated;

comment on table public.review_replies is
  'One public host reply per guest review. Write through reply_to_review(); read through review_replies().';

-- The host of the session a guest review is about, or null when the review is
-- not a guest review.
create or replace function public.review_host_id(p_review_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.host_id
  from public.reviews r
  join public.bookings b on b.id = r.booking_id
  join public.sessions s on s.id = b.session_id
  join public.listings l on l.id = s.listing_id
  where r.id = p_review_id
    and r.role = 'guest';
$$;

revoke all on function public.review_host_id(uuid) from public, anon, authenticated;

-- Post or edit your reply. Returns the saved reply.
create or replace function public.reply_to_review(p_review_id uuid, p_body text)
returns table (review_id uuid, body text, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.reviews;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select r.* into v_review from public.reviews r where r.id = p_review_id;
  if v_review.id is null or public.review_host_id(p_review_id) is distinct from auth.uid() then
    raise exception 'you can only reply to reviews of your own sessions';
  end if;
  if not public.review_is_public(v_review) then
    raise exception 'you can reply once the review is public';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'write a reply first';
  end if;
  if char_length(v_body) > 600 then
    raise exception 'keep your reply to 600 characters';
  end if;

  insert into public.review_replies as rr (review_id, host_id, body)
  values (p_review_id, auth.uid(), v_body)
  on conflict on constraint review_replies_pkey do update
    set body = excluded.body,
        updated_at = now();

  return query
  select rr.review_id, rr.body, rr.created_at, rr.updated_at
  from public.review_replies rr
  where rr.review_id = p_review_id;
end;
$$;

revoke all on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

-- Remove your reply. Returns true when there was one.
create or replace function public.delete_review_reply(p_review_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from public.review_replies rr
  where rr.review_id = p_review_id
    and rr.host_id = auth.uid()
  returning true into v_found;
  return coalesce(v_found, false);
end;
$$;

revoke all on function public.delete_review_reply(uuid) from public, anon;
grant execute on function public.delete_review_reply(uuid) to authenticated;

-- Replies for the reviews a page is showing. Only replies under public guest
-- reviews come back, so a reply never leaks a hidden review.
create or replace function public.review_replies(p_review_ids uuid[])
returns table (
  review_id uuid,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  host_display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select rr.review_id, rr.body, rr.created_at, rr.updated_at, u.display_name
  from public.review_replies rr
  join public.reviews r on r.id = rr.review_id
  left join public.users u on u.id = rr.host_id
  where rr.review_id = any(coalesce(p_review_ids, '{}'::uuid[]))
    and r.role = 'guest'
    and public.review_is_public(r);
$$;

revoke all on function public.review_replies(uuid[]) from public;
grant execute on function public.review_replies(uuid[]) to anon, authenticated;
