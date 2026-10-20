-- "I'm keen" on listings with no upcoming sessions (DECISIONS.md, 20 October).
--
-- A signed-in guest taps "I'm keen" on a listing with no dates, optionally
-- picking when suits them (weekday / weekend, morning / afternoon / evening)
-- and a group size. The host is emailed (at most once a day per listing) and
-- sees counts on the Hosting tab. When the host adds sessions, everyone still
-- keen is emailed once and their row is marked notified.
--
-- Writes:
--   * The `listing-interest` Edge Function inserts and updates rows with the
--     service role, because it also emails the host.
--   * `clear_my_listing_interest` lets a guest withdraw their own row.
--   * The `notify-interested` Edge Function sets notified_at.
-- Clients have no table grants at all. Reads go through the functions below,
-- so a host never sees who is keen, only counts and tallies.
--
-- "Open" interest: notified_at is null and updated within the last 30 days.
-- Older rows stop counting (a guest can tap again to refresh them).
--
-- Safe to run more than once.

create table if not exists public.listing_interests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  guest_id uuid not null references public.users(id) on delete cascade,
  days text[] not null default '{}'
    check (days <@ array['weekday', 'weekend']::text[]),
  times text[] not null default '{}'
    check (times <@ array['morning', 'afternoon', 'evening']::text[]),
  group_size integer not null default 1 check (group_size between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notified_at timestamptz
);

create unique index if not exists listing_interests_listing_guest_key
  on public.listing_interests (listing_id, guest_id);

create index if not exists listing_interests_open_idx
  on public.listing_interests (listing_id, updated_at)
  where notified_at is null;

alter table public.listing_interests enable row level security;
revoke all on table public.listing_interests from public, anon, authenticated;
grant all on table public.listing_interests to service_role;

-- One row per listing: when the host was last emailed about keen guests.
create table if not exists public.listing_interest_host_notices (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  notified_at timestamptz not null
);

alter table public.listing_interest_host_notices enable row level security;
revoke all on table public.listing_interest_host_notices from public, anon, authenticated;
grant all on table public.listing_interest_host_notices to service_role;

-- Public count of open interest, for browse cards and the listing page.
-- Only active listings whose host is in good standing (00027).
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
    and public.listing_host_in_good_standing(l.id)
  group by i.listing_id;
$$;

revoke all on function public.listing_keen_counts(uuid[]) from public;
grant execute on function public.listing_keen_counts(uuid[]) to anon, authenticated;

-- The caller's own open interest in one listing, so the page can show
-- "Mei Ling's been nudged" and pre-fill the chips.
create or replace function public.my_listing_interest(p_listing_id uuid)
returns table (days text[], times text[], group_size integer, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.days, i.times, i.group_size, i.updated_at
  from public.listing_interests i
  where i.listing_id = p_listing_id
    and i.guest_id = auth.uid()
    and i.notified_at is null
    and i.updated_at > now() - interval '30 days';
$$;

revoke all on function public.my_listing_interest(uuid) from public;
grant execute on function public.my_listing_interest(uuid) to authenticated;

create or replace function public.clear_my_listing_interest(p_listing_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.listing_interests
  where listing_id = p_listing_id
    and guest_id = auth.uid();
$$;

revoke all on function public.clear_my_listing_interest(uuid) from public;
grant execute on function public.clear_my_listing_interest(uuid) to authenticated;

-- Hosting tab: counts and tallies for the caller's own listings. Never names
-- or ids of the guests. A row that picked no days counts toward neither day
-- tally ("any time"), and the same for times.
create or replace function public.host_listing_interest()
returns table (
  listing_id uuid,
  keen_count integer,
  weekday integer,
  weekend integer,
  morning integer,
  afternoon integer,
  evening integer,
  min_group integer,
  max_group integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.listing_id,
    count(*)::integer,
    count(*) filter (where 'weekday' = any (i.days))::integer,
    count(*) filter (where 'weekend' = any (i.days))::integer,
    count(*) filter (where 'morning' = any (i.times))::integer,
    count(*) filter (where 'afternoon' = any (i.times))::integer,
    count(*) filter (where 'evening' = any (i.times))::integer,
    min(i.group_size)::integer,
    max(i.group_size)::integer
  from public.listing_interests i
  join public.listings l on l.id = i.listing_id
  where l.host_id = auth.uid()
    and i.notified_at is null
    and i.updated_at > now() - interval '30 days'
  group by i.listing_id;
$$;

revoke all on function public.host_listing_interest() from public;
grant execute on function public.host_listing_interest() to authenticated;
