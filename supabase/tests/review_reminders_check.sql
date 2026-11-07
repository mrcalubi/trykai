-- Review reminders check. Run in the staging SQL Editor after 00051.
--
-- begin … rollback so nothing is kept and no email is sent (this only calls
-- the database function; the emails are sent by send-reminders). "ROLLBACK"
-- with no error means every check passed.

begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  g1 uuid := gen_random_uuid();   -- booked for 2, friend f1 took the seat
  g2 uuid := gen_random_uuid();   -- host already reviewed g2
  g3 uuid := gen_random_uuid();   -- g3 already reviewed the host
  g4 uuid := gen_random_uuid();   -- session ended 6 days ago
  g5 uuid := gen_random_uuid();   -- session ended 8 days ago
  g6 uuid := gen_random_uuid();   -- session ended 1 hour ago
  g7 uuid := gen_random_uuid();   -- cancelled booking
  f1 uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  s_recent uuid := gen_random_uuid();   -- ended 3 hours ago
  s_day6 uuid := gen_random_uuid();
  s_day8 uuid := gen_random_uuid();
  s_justnow uuid := gen_random_uuid();
  s_cancel uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid();
  b2 uuid := gen_random_uuid();
  b3 uuid := gen_random_uuid();
  b4 uuid := gen_random_uuid();
  b5 uuid := gen_random_uuid();
  b6 uuid := gen_random_uuid();
  b7 uuid := gen_random_uuid();
  v_area text;
  r record;
  v_count int;
  v_kinds text;
  v_names text[];
begin
  select name into v_area from public.planning_areas limit 1;

  insert into public.users (id, full_name, email, display_name, is_host) values
    (v_host, 'Host R', 'rr-host-' || v_host || '@trykai.test', 'Host R', true),
    (g1, 'Guest One', 'rr-g1-' || g1 || '@trykai.test', 'Guest One', false),
    (g2, 'Guest Two', 'rr-g2-' || g2 || '@trykai.test', 'Guest Two', false),
    (g3, 'Guest Three', 'rr-g3-' || g3 || '@trykai.test', 'Guest Three', false),
    (g4, 'Guest Four', 'rr-g4-' || g4 || '@trykai.test', 'Guest Four', false),
    (g5, 'Guest Five', 'rr-g5-' || g5 || '@trykai.test', 'Guest Five', false),
    (g6, 'Guest Six', 'rr-g6-' || g6 || '@trykai.test', 'Guest Six', false),
    (g7, 'Guest Seven', 'rr-g7-' || g7 || '@trykai.test', 'Guest Seven', false),
    (f1, 'Friend One', 'rr-f1-' || f1 || '@trykai.test', 'Friend One', false);

  insert into public.listings (
    id, host_id, title, description, category, price_per_person, max_guests, duration_mins,
    area, review_status, is_active, full_address
  ) values (
    v_listing, v_host, 'RR check', 'A session used only inside this rollback.', 'Food', 2500, 6, 60,
    v_area, 'approved', true, 'Blk 1 Check Street'
  );

  -- 60-minute sessions, far enough apart not to overlap.
  insert into public.sessions (id, listing_id, starts_at, duration_mins, spots_total, spots_remaining, status) values
    (s_recent, v_listing, now() - interval '4 hours', 60, 6, 0, 'open'),
    (s_day6, v_listing, now() - interval '6 days' - interval '1 hour', 60, 6, 5, 'open'),
    (s_day8, v_listing, now() - interval '8 days' - interval '1 hour', 60, 6, 5, 'open'),
    (s_justnow, v_listing, now() - interval '2 hours', 60, 6, 5, 'open'),
    (s_cancel, v_listing, now() - interval '5 hours 30 minutes', 60, 6, 6, 'open');

  insert into public.bookings (id, session_id, guest_id, guests_count, total_amount, platform_fee, status, created_at) values
    (b1, s_recent, g1, 2, 5000, 600, 'confirmed', now() - interval '3 days'),
    (b2, s_recent, g2, 1, 2500, 300, 'confirmed', now() - interval '2 days'),
    (b3, s_recent, g3, 1, 2500, 300, 'confirmed', now() - interval '1 day'),
    (b4, s_day6, g4, 1, 2500, 300, 'confirmed', now() - interval '9 days'),
    (b5, s_day8, g5, 1, 2500, 300, 'confirmed', now() - interval '10 days'),
    (b6, s_justnow, g6, 1, 2500, 300, 'confirmed', now() - interval '1 day'),
    (b7, s_cancel, g7, 1, 2500, 300, 'cancelled', now() - interval '1 day');

  insert into public.booking_guests (booking_id, user_id, joined_at) values (b1, f1, now() - interval '20 hours');

  insert into public.reviews (booking_id, reviewer_id, reviewee_id, rating, comment, role)
  values (b3, g3, v_host, 5, 'Lovely', 'guest');
  insert into public.reviews (booking_id, reviewer_id, reviewee_id, rating, comment, role)
  values (b2, v_host, g2, 5, 'Guest Two was great', 'host');

  -- ---- Clients cannot call it. ----
  execute 'set local role authenticated';
  begin
    perform 1 from public.claim_review_reminders(200);
    raise exception 'authenticated could call claim_review_reminders';
  exception when insufficient_privilege then null;
  end;
  execute 'set local role postgres';

  -- ---- The limit is respected, closest deadline first. ----
  select count(*), string_agg(c.kind, ',') into v_count, v_kinds
  from public.claim_review_reminders(1) c
  where c.session_id in (s_recent, s_day6, s_day8, s_justnow, s_cancel);
  if v_count <> 1 or v_kinds <> 'guest_nudge' then
    raise exception 'limit 1 should return the day-6 guest reminder, got % (%)', v_count, v_kinds;
  end if;
  if (select review_nudge_sent_at is null or review_prompt_sent_at is null from public.bookings where id = b4) then
    raise exception 'a guest reminder should also mark the prompt, so day 5 guests get one email';
  end if;

  -- ---- Everything else that is due. ----
  create temp table rr_out on commit drop as
    select * from public.claim_review_reminders(200) c
    where c.session_id in (s_recent, s_day6, s_day8, s_justnow, s_cancel);

  select string_agg(c.kind || ':' || coalesce(c.booking_id::text, c.session_id::text), ',' order by c.kind, c.booking_id)
  into v_kinds from rr_out c;

  if (select count(*) from rr_out) <> 4 then
    raise exception 'expected 4 more emails (2 guest prompts, host reminder, host prompt), got %: %',
      (select count(*) from rr_out), v_kinds;
  end if;

  -- Guest prompts: g1 and g2 only (g3 reviewed; g6 too soon; g5 too late; g7 cancelled).
  if not exists (select 1 from rr_out where kind = 'guest_prompt' and booking_id = b1)
    or not exists (select 1 from rr_out where kind = 'guest_prompt' and booking_id = b2) then
    raise exception 'g1 and g2 should get a guest prompt: %', v_kinds;
  end if;
  if exists (select 1 from rr_out where booking_id in (b3, b5, b6, b7)) then
    raise exception 'reviewed, too late, too soon or cancelled bookings must not be emailed: %', v_kinds;
  end if;
  select other_name, recipient_name into r from rr_out where booking_id = b1;
  if r.other_name <> 'Host R' or r.recipient_name <> 'Guest One' then
    raise exception 'guest prompt names wrong: %', r;
  end if;
  if (select deadline from rr_out where booking_id = b1) <> (now() - interval '3 hours' + interval '7 days') then
    raise exception 'deadline should be session end + 7 days';
  end if;

  -- Host prompt for the recent session lists g1, g3 and the friend, not g2.
  select people into v_names from rr_out where kind = 'host_prompt' and session_id = s_recent;
  if v_names is distinct from array['Guest One', 'Guest Three', 'Friend One'] then
    raise exception 'host prompt people wrong: %', v_names;
  end if;
  select people into v_names from rr_out where kind = 'host_nudge' and session_id = s_day6;
  if v_names is distinct from array['Guest Four'] then
    raise exception 'host reminder people wrong: %', v_names;
  end if;
  if exists (select 1 from rr_out where session_id in (s_day8, s_justnow, s_cancel)) then
    raise exception 'host emails for too-late, too-soon or cancelled-only sessions: %', v_kinds;
  end if;

  -- ---- Nothing twice. ----
  select count(*) into v_count from public.claim_review_reminders(200) c
  where c.session_id in (s_recent, s_day6, s_day8, s_justnow, s_cancel);
  if v_count <> 0 then
    raise exception 'second run should send nothing, got %', v_count;
  end if;

  -- ---- A host who has reviewed everyone gets nothing. ----
  update public.sessions set host_review_prompt_sent_at = null where id = s_recent;
  insert into public.reviews (booking_id, reviewer_id, reviewee_id, rating, comment, role) values
    (b1, v_host, g1, 5, 'Guest One was great', 'host'),
    (b1, v_host, f1, 5, 'Friend One was great', 'host'),
    (b3, v_host, g3, 5, 'Guest Three was great', 'host');
  select count(*) into v_count from public.claim_review_reminders(200) c where c.session_id = s_recent;
  if v_count <> 0 then
    raise exception 'host with nobody left to review should get no email, got %', v_count;
  end if;
end;
$$;

rollback;
