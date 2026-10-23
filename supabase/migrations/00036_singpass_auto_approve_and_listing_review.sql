-- Two changes from Caleb's staging run (DECISIONS.md, 23 October).
--
-- 1. A Singpass result approves the host straight away. Singpass is the
--    identity check, so there is nothing left for a person to verify; the
--    sense-check moves to the listing (below). record_singpass_verification
--    now sets 'approved' and writes the verification_reviews row itself
--    (reviewer null, method 'singpass'). Uploads still go to manual review.
--
-- 2. Every new listing is reviewed before guests can see it. The host is
--    never slowed down: they can create the listing and add dates at once,
--    and the TryKai team is emailed straight away (listing-submitted). Until
--    a reviewer approves it, the listing is visible only to its host.
--      * listings.review_status: 'pending' | 'approved' | 'changes_requested'.
--        Existing listings are 'approved'. review_note is the reviewer's
--        message to the host, cleared on approval.
--      * guard_listing_review: a client can never set these fields. A new
--        listing is always 'pending'; editing a 'changes_requested' listing
--        sends it back to 'pending'. Edits to an approved listing do not
--        trigger a new review (KIV).
--      * The public read policy (00027) also requires 'approved', as do
--        listing_keen_counts and create-payment-intent.
--      * review_listing (service role only) records a decision and a
--        listing_reviews log row in one transaction.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Singpass approves on the spot
-- ---------------------------------------------------------------------------

create or replace function public.record_singpass_verification(
  p_user_id uuid,
  p_sub text,
  p_name text,
  p_dob text,
  p_mobile text default null,
  p_teaching_plan text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_plan text := nullif(btrim(coalesce(p_teaching_plan, '')), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_dob text := nullif(btrim(coalesce(p_dob, '')), '');
  v_mobile text := nullif(btrim(coalesce(p_mobile, '')), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  if coalesce(btrim(p_sub), '') = '' then
    raise exception 'singpass identifier is required';
  end if;

  if v_name is null then
    raise exception 'singpass name is required';
  end if;

  if v_dob is null or v_dob !~ '^\d{4}(-\d{2}(-\d{2})?)?$' then
    raise exception 'singpass date of birth is required';
  end if;

  -- singpass-callback also refuses partial dates that could be under 18.
  if v_dob ~ '^\d{4}-\d{2}-\d{2}$'
     and v_dob::date > ((now() at time zone 'Asia/Singapore')::date - interval '18 years') then
    raise exception 'under 18';
  end if;

  if v_plan is not null and char_length(v_plan) > 600 then
    raise exception 'what you plan to teach must be 600 characters or fewer';
  end if;

  if exists (
    select 1 from public.users
    where singpass_sub = p_sub and id <> p_user_id
  ) then
    raise exception 'singpass already linked';
  end if;

  select verification_status into v_status
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  if v_status = 'approved' then
    raise exception 'already verified';
  end if;

  update public.users
  set singpass_sub = p_sub,
      verified_name = v_name,
      verified_dob = v_dob,
      verified_mobile = v_mobile,
      teaching_plan = coalesce(v_plan, teaching_plan),
      verification_status = 'approved',
      verification_method = 'singpass',
      verification_submitted_at = now(),
      verification_consent_at = now(),
      verification_rejection_reason = null,
      verification_reviewed_at = now()
  where id = p_user_id;

  -- Singpass is the check; there is no human reviewer on this route.
  insert into public.verification_reviews (user_id, reviewer_id, decision, reason, method)
  values (p_user_id, null, 'approved', null, 'singpass');

  return 'approved';
end;
$$;


revoke all on function public.record_singpass_verification(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_singpass_verification(uuid, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Listing review
-- ---------------------------------------------------------------------------

alter table public.listings
  add column if not exists review_status text not null default 'approved',
  add column if not exists review_note text,
  add column if not exists review_requested_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notified_at timestamptz;

-- Existing rows took 'approved' above; new ones start pending (the trigger
-- enforces it for clients either way).
alter table public.listings alter column review_status set default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_review_status_check') then
    alter table public.listings
      add constraint listings_review_status_check
      check (review_status in ('pending', 'approved', 'changes_requested'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listings_review_note_length') then
    alter table public.listings
      add constraint listings_review_note_length
      check (review_note is null or char_length(review_note) <= 500);
  end if;
end $$;

create index if not exists listings_review_pending_idx
  on public.listings (review_requested_at)
  where review_status = 'pending';

-- The host reads their own listing's state and the reviewer's note. Notes are
-- cleared on approval and only approved listings are public, so no one else
-- ever reads a note.
grant select (review_status) on table public.listings to anon, authenticated;
grant select (review_note) on table public.listings to authenticated;
revoke insert (review_status, review_note, review_requested_at, reviewed_at, review_notified_at),
       update (review_status, review_note, review_requested_at, reviewed_at, review_notified_at)
  on table public.listings from anon, authenticated;

create or replace function public.guard_listing_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.review_status := 'pending';
    new.review_note := null;
    new.review_requested_at := now();
    new.reviewed_at := null;
    new.review_notified_at := null;
    return new;
  end if;

  new.review_status := old.review_status;
  new.review_note := old.review_note;
  new.review_requested_at := old.review_requested_at;
  new.reviewed_at := old.reviewed_at;
  new.review_notified_at := old.review_notified_at;

  -- The host has acted on the reviewer's note: back into the queue.
  if old.review_status = 'changes_requested'
     and (new.title, new.description, new.category, new.price_per_person, new.photo_urls,
          new.whats_provided, new.area, new.duration_mins, new.full_address)
         is distinct from
         (old.title, old.description, old.category, old.price_per_person, old.photo_urls,
          old.whats_provided, old.area, old.duration_mins, old.full_address) then
    new.review_status := 'pending';
    new.review_requested_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists listings_guard_review on public.listings;
create trigger listings_guard_review
  before insert or update on public.listings
  for each row
  execute function public.guard_listing_review();

drop policy if exists "Anyone can view active listings" on public.listings;
create policy "Anyone can view active listings" on public.listings
  for select
  using (
    is_active = true
    and review_status = 'approved'
    and public.listing_host_in_good_standing(id)
  );

create or replace function public.listing_keen_counts(p_listing_ids uuid[])
returns table (listing_id uuid, keen_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select i.listing_id, count(*)::integer
  from public.listing_interests i
  join public.listings l on l.id = i.listing_id
  where i.listing_id = any (p_listing_ids[1:200])
    and i.notified_at is null
    and i.updated_at > now() - interval '30 days'
    and l.is_active
    and l.review_status = 'approved'
    and public.listing_host_in_good_standing(l.id)
  group by i.listing_id;
$$;

revoke all on function public.listing_keen_counts(uuid[]) from public;
grant execute on function public.listing_keen_counts(uuid[]) to anon, authenticated;

create table if not exists public.listing_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  reviewer_id uuid references public.users(id) on delete set null,
  decision text not null check (decision in ('approved', 'changes_requested')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists listing_reviews_listing_id_idx
  on public.listing_reviews (listing_id, created_at desc);

alter table public.listing_reviews enable row level security;
revoke all on table public.listing_reviews from public, anon, authenticated;
grant select, insert on table public.listing_reviews to service_role;

create or replace function public.review_listing(
  p_listing_id uuid,
  p_decision text,
  p_note text default null,
  p_reviewer_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'decision must be approved or changes_requested';
  end if;

  if p_decision = 'changes_requested' and v_note is null then
    raise exception 'a note for the host is required';
  end if;

  select review_status into v_status
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'listing not found';
  end if;

  update public.listings
  set review_status = p_decision,
      review_note = case when p_decision = 'approved' then null else v_note end,
      reviewed_at = now()
  where id = p_listing_id;

  insert into public.listing_reviews (listing_id, reviewer_id, decision, note)
  values (p_listing_id, p_reviewer_id, p_decision, v_note);

  return p_decision;
end;
$$;

revoke all on function public.review_listing(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.review_listing(uuid, text, text, uuid) to service_role;
