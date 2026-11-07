-- Review prompts and reminders (DECISIONS.md, 7 November 2026).
--
-- The hourly send-reminders job (00037) also emails, for every confirmed
-- booking whose session has ended:
--   guest_prompt  about 2 hours after the session ends, if the guest has not reviewed
--   guest_nudge   from day 5 (2 days before reviews close), if still not reviewed
--   host_prompt   one email per session, listing everyone the host has not reviewed
--                 (bookers and friends who took a seat, 00050)
--   host_nudge    from day 5, if anyone is still unreviewed
-- Reviews close 7 days after the session ends (00048), so nothing is sent
-- after that. A guest or host first seen on day 5 or later gets only the
-- reminder, never both on the same day.
--
-- claim_review_reminders() selects and claims in one statement per kind
-- (UPDATE ... WHERE sent_at IS NULL), so two overlapping runs cannot send
-- the same email twice. Same rule as 00037: claimed, then sent; a failed
-- send is not retried.
--
-- Requires 00048 (reviews.role per booking) and 00050 (booking_guests).
-- Apply on staging, then production, before merging the send-reminders
-- change. The function tolerates this migration missing (it skips review
-- emails and still sends session reminders), so the order is a preference,
-- not a hard requirement. No new vault secrets: it rides on the 00037 job.
--
-- Safe to run more than once.

alter table public.bookings
  add column if not exists review_prompt_sent_at timestamptz,
  add column if not exists review_nudge_sent_at timestamptz;

alter table public.sessions
  add column if not exists host_review_prompt_sent_at timestamptz,
  add column if not exists host_review_nudge_sent_at timestamptz;

comment on column public.bookings.review_prompt_sent_at is
  'Claimed by claim_review_reminders when the guest review prompt is sent. Clients cannot write it.';
comment on column public.bookings.review_nudge_sent_at is
  'Claimed by claim_review_reminders when the day-5 guest review reminder is sent. Clients cannot write it.';
comment on column public.sessions.host_review_prompt_sent_at is
  'Claimed by claim_review_reminders when the host review prompt is sent. Clients cannot write it.';
comment on column public.sessions.host_review_nudge_sent_at is
  'Claimed by claim_review_reminders when the day-5 host review reminder is sent. Clients cannot write it.';

-- Writes: clients can never set these, so nobody can fake or suppress a
-- reminder. Reads: bookings and sessions have table-level SELECT (rows limited
-- by RLS), so a column-level revoke cannot hide them, exactly like the 00037
-- reminder columns. They only say when an email was sent; harmless.
revoke update (review_prompt_sent_at, review_nudge_sent_at) on table public.bookings
  from public, anon, authenticated;
revoke insert (review_prompt_sent_at, review_nudge_sent_at) on table public.bookings
  from public, anon, authenticated;

revoke update (host_review_prompt_sent_at, host_review_nudge_sent_at) on table public.sessions
  from public, anon, authenticated;
revoke insert (host_review_prompt_sent_at, host_review_nudge_sent_at) on table public.sessions
  from public, anon, authenticated;

create or replace function public.claim_review_reminders(p_limit integer default 200)
returns table (
  kind text,              -- 'guest_nudge' | 'guest_prompt' | 'host_nudge' | 'host_prompt'
  booking_id uuid,        -- guest kinds only
  session_id uuid,
  recipient_email text,
  recipient_name text,
  other_name text,        -- guest kinds: the host's display name
  listing_title text,
  deadline timestamptz,   -- session end + 7 days: reviews close
  people text[]           -- host kinds: display names still to review
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer := greatest(coalesce(p_limit, 0), 0);
  v_count integer;
begin
  -- 1. Guest reminders (closest deadline first). Also marks the prompt so a
  --    guest first seen on day 5 does not get both.
  if v_left > 0 then
    return query
    with due as (
      select
        b.id as b_id,
        b.session_id as s_id,
        gu.email as g_email,
        gu.display_name as g_name,
        hu.display_name as h_name,
        l.title as l_title,
        s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute') as s_end
      from public.bookings b
      join public.sessions s on s.id = b.session_id
      join public.listings l on l.id = s.listing_id
      join public.users gu on gu.id = b.guest_id
      left join public.users hu on hu.id = l.host_id
      where b.status = 'confirmed'
        and b.review_nudge_sent_at is null
        and s.status is distinct from 'cancelled'
        and gu.email is not null
    ),
    picked as (
      select d.*
      from due d
      where now() >= d.s_end + interval '5 days'
        and now() < d.s_end + interval '7 days'
        and not exists (
          select 1 from public.reviews r where r.booking_id = d.b_id and r.role = 'guest'
        )
      order by d.s_end
      limit v_left
    ),
    claimed as (
      update public.bookings b
      set review_nudge_sent_at = now(),
          review_prompt_sent_at = coalesce(b.review_prompt_sent_at, now())
      from picked p
      where b.id = p.b_id
        and b.review_nudge_sent_at is null
      returning b.id
    )
    select 'guest_nudge'::text, p.b_id, p.s_id, p.g_email, p.g_name, p.h_name, p.l_title,
      p.s_end + interval '7 days', null::text[]
    from picked p
    join claimed c on c.id = p.b_id;
    get diagnostics v_count = row_count;
    v_left := v_left - v_count;
  end if;

  -- 2. Guest prompts: 2 hours to 5 days after the session ends.
  if v_left > 0 then
    return query
    with due as (
      select
        b.id as b_id,
        b.session_id as s_id,
        gu.email as g_email,
        gu.display_name as g_name,
        hu.display_name as h_name,
        l.title as l_title,
        s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute') as s_end
      from public.bookings b
      join public.sessions s on s.id = b.session_id
      join public.listings l on l.id = s.listing_id
      join public.users gu on gu.id = b.guest_id
      left join public.users hu on hu.id = l.host_id
      where b.status = 'confirmed'
        and b.review_prompt_sent_at is null
        and s.status is distinct from 'cancelled'
        and gu.email is not null
    ),
    picked as (
      select d.*
      from due d
      where now() >= d.s_end + interval '2 hours'
        and now() < d.s_end + interval '5 days'
        and not exists (
          select 1 from public.reviews r where r.booking_id = d.b_id and r.role = 'guest'
        )
      order by d.s_end
      limit v_left
    ),
    claimed as (
      update public.bookings b
      set review_prompt_sent_at = now()
      from picked p
      where b.id = p.b_id
        and b.review_prompt_sent_at is null
      returning b.id
    )
    select 'guest_prompt'::text, p.b_id, p.s_id, p.g_email, p.g_name, p.h_name, p.l_title,
      p.s_end + interval '7 days', null::text[]
    from picked p
    join claimed c on c.id = p.b_id;
    get diagnostics v_count = row_count;
    v_left := v_left - v_count;
  end if;

  -- 3 and 4. Hosts: one email per session listing everyone not yet reviewed.
  if v_left > 0 then
    return query
    with people as (
      select b.session_id as s_id, b.id as b_id, b.guest_id as person_id, b.created_at as sort_at
      from public.bookings b
      where b.status = 'confirmed'
      union all
      select b.session_id, b.id, bg.user_id, bg.joined_at
      from public.booking_guests bg
      join public.bookings b on b.id = bg.booking_id
      where b.status = 'confirmed'
    ),
    unreviewed as (
      select
        p.s_id,
        array_agg(coalesce(nullif(btrim(u.display_name), ''), 'A guest') order by p.sort_at) as names
      from people p
      left join public.users u on u.id = p.person_id
      where not exists (
        select 1 from public.reviews r
        where r.booking_id = p.b_id and r.role = 'host' and r.reviewee_id = p.person_id
      )
      group by p.s_id
    ),
    due as (
      select
        s.id as s_id,
        hu.email as h_email,
        hu.display_name as h_name,
        l.title as l_title,
        un.names,
        s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute') as s_end
      from public.sessions s
      join public.listings l on l.id = s.listing_id
      join public.users hu on hu.id = l.host_id
      join unreviewed un on un.s_id = s.id
      where s.host_review_nudge_sent_at is null
        and s.status is distinct from 'cancelled'
        and hu.email is not null
    ),
    picked as (
      select d.*
      from due d
      where now() >= d.s_end + interval '5 days'
        and now() < d.s_end + interval '7 days'
      order by d.s_end
      limit v_left
    ),
    claimed as (
      update public.sessions s
      set host_review_nudge_sent_at = now(),
          host_review_prompt_sent_at = coalesce(s.host_review_prompt_sent_at, now())
      from picked p
      where s.id = p.s_id
        and s.host_review_nudge_sent_at is null
      returning s.id
    )
    select 'host_nudge'::text, null::uuid, p.s_id, p.h_email, p.h_name, null::text, p.l_title,
      p.s_end + interval '7 days', p.names
    from picked p
    join claimed c on c.id = p.s_id;
    get diagnostics v_count = row_count;
    v_left := v_left - v_count;
  end if;

  if v_left > 0 then
    return query
    with people as (
      select b.session_id as s_id, b.id as b_id, b.guest_id as person_id, b.created_at as sort_at
      from public.bookings b
      where b.status = 'confirmed'
      union all
      select b.session_id, b.id, bg.user_id, bg.joined_at
      from public.booking_guests bg
      join public.bookings b on b.id = bg.booking_id
      where b.status = 'confirmed'
    ),
    unreviewed as (
      select
        p.s_id,
        array_agg(coalesce(nullif(btrim(u.display_name), ''), 'A guest') order by p.sort_at) as names
      from people p
      left join public.users u on u.id = p.person_id
      where not exists (
        select 1 from public.reviews r
        where r.booking_id = p.b_id and r.role = 'host' and r.reviewee_id = p.person_id
      )
      group by p.s_id
    ),
    due as (
      select
        s.id as s_id,
        hu.email as h_email,
        hu.display_name as h_name,
        l.title as l_title,
        un.names,
        s.starts_at + (coalesce(s.duration_mins, l.duration_mins, 120) * interval '1 minute') as s_end
      from public.sessions s
      join public.listings l on l.id = s.listing_id
      join public.users hu on hu.id = l.host_id
      join unreviewed un on un.s_id = s.id
      where s.host_review_prompt_sent_at is null
        and s.status is distinct from 'cancelled'
        and hu.email is not null
    ),
    picked as (
      select d.*
      from due d
      where now() >= d.s_end + interval '2 hours'
        and now() < d.s_end + interval '5 days'
      order by d.s_end
      limit v_left
    ),
    claimed as (
      update public.sessions s
      set host_review_prompt_sent_at = now()
      from picked p
      where s.id = p.s_id
        and s.host_review_prompt_sent_at is null
      returning s.id
    )
    select 'host_prompt'::text, null::uuid, p.s_id, p.h_email, p.h_name, null::text, p.l_title,
      p.s_end + interval '7 days', p.names
    from picked p
    join claimed c on c.id = p.s_id;
  end if;
end;
$$;

comment on function public.claim_review_reminders(integer) is
  'Claims and returns due review prompt and reminder emails (guests and hosts). service_role only; called by send-reminders.';

revoke all on function public.claim_review_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_review_reminders(integer) to service_role;
