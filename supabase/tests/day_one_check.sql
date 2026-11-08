-- Day One guests check. Run in the SQL Editor after 00053.
--
-- begin … rollback so nothing is kept (existing Day One numbers come back
-- after the rollback). "ROLLBACK" with no error means every check passed.

begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  g1 uuid := gen_random_uuid();
  g2 uuid := gen_random_uuid();
  g3 uuid := gen_random_uuid();
  f1 uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid();
  b2 uuid := gen_random_uuid();
  b3 uuid := gen_random_uuid();
  b4 uuid := gen_random_uuid();
  v_area text;
  v_number integer;
  v_left integer;
begin
  -- Start from an empty list inside this transaction.
  delete from public.day_one_guests;

  select name into v_area from public.planning_areas limit 1;

  insert into public.users (id, full_name, email, display_name, is_host) values
    (v_host, 'Host D', 'd1-host-' || v_host || '@trykai.test', 'Host D', true),
    (g1, 'Guest One', 'd1-g1-' || g1 || '@trykai.test', 'Guest One', false),
    (g2, 'Guest Two', 'd1-g2-' || g2 || '@trykai.test', 'Guest Two', false),
    (g3, 'Guest Three', 'd1-g3-' || g3 || '@trykai.test', 'Guest Three', false),
    (f1, 'Friend One', 'd1-f1-' || f1 || '@trykai.test', 'Friend One', false);

  insert into public.listings (
    id, host_id, title, description, category, price_per_person, max_guests, duration_mins,
    area, review_status, is_active, full_address
  ) values (
    v_listing, v_host, 'Day One check', 'A session used only inside this rollback.', 'Food', 1500, 10, 60,
    v_area, 'approved', true, 'Blk 1 Check Street'
  );

  insert into public.sessions (id, listing_id, starts_at, duration_mins, spots_total, spots_remaining, status)
  values (v_session, v_listing, now() + interval '3 days', 60, 10, 6, 'open');

  -- ---- A pending booking earns nothing; confirming it does. ----
  insert into public.bookings (id, session_id, guest_id, guests_count, total_amount, platform_fee, status)
  values (b1, v_session, g1, 2, 3300, 300, 'pending');
  if exists (select 1 from public.day_one_guests where user_id = g1) then
    raise exception 'a pending booking should not earn Day One';
  end if;
  update public.bookings set status = 'confirmed' where id = b1;
  if public.day_one_number(g1) is distinct from 1 then
    raise exception 'first confirmed guest should be #1, got %', public.day_one_number(g1);
  end if;

  -- ---- Next guest is #2; a friend taking a seat is #3. ----
  insert into public.bookings (id, session_id, guest_id, guests_count, total_amount, platform_fee, status)
  values (b2, v_session, g2, 1, 1800, 300, 'confirmed');
  insert into public.booking_guests (booking_id, user_id) values (b1, f1);
  if public.day_one_number(g2) is distinct from 2 or public.day_one_number(f1) is distinct from 3 then
    raise exception 'expected g2 #2 and friend #3, got % and %', public.day_one_number(g2), public.day_one_number(f1);
  end if;

  -- ---- A second booking keeps the first number; a cancel keeps it too. ----
  insert into public.bookings (id, session_id, guest_id, guests_count, total_amount, platform_fee, status)
  values (b3, v_session, g1, 1, 1800, 300, 'confirmed');
  update public.bookings set status = 'cancelled' where id = b1;
  if public.day_one_number(g1) is distinct from 1 or (select count(*) from public.day_one_guests) <> 3 then
    raise exception 'g1 should stay #1 with 3 numbers given out';
  end if;

  -- ---- A deleted number goes to the next guest. ----
  delete from public.day_one_guests where user_id = g2;
  if public.award_day_one(g2, b2) is distinct from 2 then
    raise exception 'a freed number should be given out again';
  end if;

  -- ---- Nothing after launch. ----
  if public.award_day_one(g3, null, public.day_one_ends_at()) is not null then
    raise exception 'no Day One number at or after launch';
  end if;

  -- ---- Never more than 50. ----
  insert into public.users (id, full_name, email, display_name, is_host)
  select x.id, 'Filler', 'd1-fill-' || x.id || '@trykai.test', 'Filler', false
  from (select gen_random_uuid() as id from generate_series(1, 47)) x;
  perform public.award_day_one(u.id, null)
  from public.users u where u.email like 'd1-fill-%@trykai.test';
  select spots_left into v_left from public.day_one_status();
  if v_left <> 0 or (select max(number) from public.day_one_guests) <> 50 then
    raise exception 'expected 50 numbers and no spots left, got % left', v_left;
  end if;
  insert into public.bookings (id, session_id, guest_id, guests_count, total_amount, platform_fee, status)
  values (b4, v_session, g3, 1, 1800, 300, 'confirmed');
  if public.day_one_number(g3) is not null then
    raise exception 'the 51st guest should not get a number';
  end if;

  -- ---- Grants: readers are public, the table and award_day_one are not. ----
  if not has_function_privilege('anon', 'public.day_one_number(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.day_one_status()', 'execute') then
    raise exception 'anon should read Day One numbers and status';
  end if;
  if has_function_privilege('authenticated', 'public.award_day_one(uuid, uuid, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.award_day_one(uuid, uuid, timestamptz)', 'execute') then
    raise exception 'clients must not call award_day_one';
  end if;
  if has_table_privilege('anon', 'public.day_one_guests', 'select')
     or has_table_privilege('authenticated', 'public.day_one_guests', 'insert') then
    raise exception 'clients must not touch day_one_guests directly';
  end if;

  raise notice 'day one check passed';
end $$;

rollback;
