-- Who's coming check. Run in the staging SQL Editor after 00050.
--
-- begin … rollback so nothing is kept. Acts as the booker, friends, the host,
-- a stranger and anon with set local role + request.jwt.claims. Raises on
-- the first failure; "ROLLBACK" with no error means every check passed.

begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  v_booker uuid := gen_random_uuid();
  v_friend1 uuid := gen_random_uuid();
  v_friend2 uuid := gen_random_uuid();
  v_friend3 uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_future_session uuid := gen_random_uuid();
  v_past_session uuid := gen_random_uuid();
  v_future_booking uuid := gen_random_uuid();
  v_past_booking uuid := gen_random_uuid();
  v_area text;
  v_code text;
  v_code2 text;
  v_past_code text;
  v_state text;
  v_booking uuid;
  v_json jsonb;
  v_count int;
  v_public boolean;

begin
  select name into v_area from public.planning_areas limit 1;

  insert into public.users (id, full_name, email, display_name, is_host) values
    (v_host, 'Host C', 'wc-host-' || v_host || '@trykai.test', 'Host C', true),
    (v_booker, 'Booker C', 'wc-booker-' || v_booker || '@trykai.test', 'Booker C', false),
    (v_friend1, 'Friend One', 'wc-f1-' || v_friend1 || '@trykai.test', 'Friend One', false),
    (v_friend2, 'Friend Two', 'wc-f2-' || v_friend2 || '@trykai.test', 'Friend Two', false),
    (v_friend3, 'Friend Three', 'wc-f3-' || v_friend3 || '@trykai.test', 'Friend Three', false),
    (v_stranger, 'Stranger C', 'wc-s-' || v_stranger || '@trykai.test', 'Stranger C', false);

  insert into public.listings (
    id, host_id, title, description, category, price_per_person, max_guests, duration_mins,
    area, review_status, is_active, full_address
  ) values (
    v_listing, v_host, 'WC check', 'A session used only inside this rollback.', 'Food', 2500, 4, 60,
    v_area, 'approved', true, 'Blk 1 Check Street, #01-01'
  );

  insert into public.sessions (id, listing_id, starts_at, duration_mins, spots_total, spots_remaining, status) values
    (v_future_session, v_listing, now() + interval '3 days', 60, 4, 1, 'open'),
    (v_past_session, v_listing, now() - interval '3 hours', 60, 4, 2, 'open');

  insert into public.bookings (id, session_id, guest_id, guests_count, total_amount, platform_fee, status) values
    (v_future_booking, v_future_session, v_booker, 3, 7500, 900, 'confirmed'),
    (v_past_booking, v_past_session, v_booker, 2, 5000, 600, 'confirmed');

  -- ---- Booker gets the link; nobody else can. ----
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_booker::text, 'role', 'authenticated')::text, true);
  v_code := public.booking_join_link(v_future_booking);
  if v_code !~ '^[a-f0-9]{20}$' then raise exception 'join code has the wrong shape: %', v_code; end if;
  if public.booking_join_link(v_future_booking) <> v_code then raise exception 'join link should be stable'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  begin
    perform public.booking_join_link(v_future_booking);
    raise exception 'stranger got a join link';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;

  -- ---- Anyone can preview; the preview has no address or prices. ----
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '', true);
  select p.state into v_state from public.join_preview(v_code) p;
  if v_state <> 'ok' then raise exception 'anon preview should be ok, got %', v_state; end if;
  if pg_get_function_result('public.join_preview(text)'::regprocedure) ~* 'address|amount|price|fee' then
    raise exception 'join_preview must not return address or money';
  end if;
  select p.state into v_state from public.join_preview('0000000000000000000a') p;
  if v_state <> 'not_found' then raise exception 'unknown code should be not_found'; end if;

  -- ---- Claiming seats. ----
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_friend1::text, 'role', 'authenticated')::text, true);
  v_booking := public.claim_booking_seat(v_code);
  if v_booking <> v_future_booking then raise exception 'claim returned the wrong booking'; end if;
  select p.state into v_state from public.join_preview(v_code) p;
  if v_state <> 'already' then raise exception 'preview after claiming should be already, got %', v_state; end if;
  begin
    perform public.claim_booking_seat(v_code);
    raise exception 'second claim by the same friend should fail';
  exception when others then
    if sqlerrm not like '%already%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_booker::text, 'role', 'authenticated')::text, true);
  begin
    perform public.claim_booking_seat(v_code);
    raise exception 'booker claimed their own seat';
  exception when others then
    if sqlerrm not like '%mine%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  begin
    perform public.claim_booking_seat(v_code);
    raise exception 'host claimed a seat';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_friend2::text, 'role', 'authenticated')::text, true);
  perform public.claim_booking_seat(v_code);

  perform set_config('request.jwt.claims', json_build_object('sub', v_friend3::text, 'role', 'authenticated')::text, true);
  select p.state into v_state from public.join_preview(v_code) p;
  if v_state <> 'full' then raise exception 'preview with no seats left should be full, got %', v_state; end if;
  begin
    perform public.claim_booking_seat(v_code);
    raise exception 'claimed a seat on a full booking';
  exception when others then
    if sqlerrm not like '%full%' then raise; end if;
  end;

  -- ---- What a companion can and cannot see. ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_friend1::text, 'role', 'authenticated')::text, true);
  v_json := public.companion_booking(v_future_booking);
  if v_json is null then raise exception 'companion could not see their booking'; end if;
  if v_json ?| array['total_amount', 'platform_fee', 'refund_amount', 'stripe_refund_id', 'payment_rail'] then
    raise exception 'companion_booking leaked a money field';
  end if;
  if (v_json ->> 'booker_display_name') <> 'Booker C' then raise exception 'companion_booking booker name wrong'; end if;
  if public.listing_address(v_listing) is distinct from 'Blk 1 Check Street, #01-01' then
    raise exception 'companion should see the address';
  end if;
  select count(*) into v_count from public.booking_companions(v_future_booking);
  if v_count <> 2 then raise exception 'companion should see 2 companions, saw %', v_count; end if;
  if jsonb_array_length(public.my_companion_bookings()) <> 1 then
    raise exception 'my_companion_bookings should list one booking';
  end if;
  if exists (select 1 from public.bookings b where b.id = v_future_booking) then
    raise exception 'companion must not read the bookings row directly';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  if public.companion_booking(v_future_booking) is not null then raise exception 'stranger saw a companion booking'; end if;
  if public.listing_address(v_listing) is not null then raise exception 'stranger saw the address'; end if;
  select count(*) into v_count from public.booking_companions(v_future_booking);
  if v_count <> 0 then raise exception 'stranger saw the companions'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.host_session_guests(array[v_future_session]);
  if v_count <> 3 then raise exception 'host should see booker + 2 companions, saw %', v_count; end if;

  -- ---- Remove and leave. ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_friend1::text, 'role', 'authenticated')::text, true);
  begin
    perform public.remove_booking_companion(v_future_booking, v_friend2);
    raise exception 'a companion removed another companion';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_booker::text, 'role', 'authenticated')::text, true);
  perform public.remove_booking_companion(v_future_booking, v_friend2);
  v_code2 := public.booking_join_link(v_future_booking);
  if v_code2 = v_code then raise exception 'remove should change the link'; end if;
  select p.state into v_state from public.join_preview(v_code) p;
  if v_state <> 'not_found' then raise exception 'old link should stop working after remove'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_friend1::text, 'role', 'authenticated')::text, true);
  perform public.leave_booking_seat(v_future_booking);
  if public.companion_booking(v_future_booking) is not null then raise exception 'leave did not remove the seat'; end if;
  if public.listing_address(v_listing) is not null then raise exception 'a friend who left still sees the address'; end if;

  -- ---- After the session: claims still allowed, host reviews companions. ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_booker::text, 'role', 'authenticated')::text, true);
  v_past_code := public.booking_join_link(v_past_booking);
  perform set_config('request.jwt.claims', json_build_object('sub', v_friend1::text, 'role', 'authenticated')::text, true);
  perform public.claim_booking_seat(v_past_code);

  select a.sessions_attended into v_count from public.my_profile_stats() a;
  if v_count < 1 then raise exception 'companion session should count as attended'; end if;

  begin
    perform public.post_review(v_past_booking, v_host, 5, 'I came too', '{}', null);
    raise exception 'a companion reviewed the host';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.host_reviews_due() d where d.booking_id = v_past_booking;
  if v_count <> 2 then raise exception 'host_reviews_due should list booker and companion, got %', v_count; end if;
  select count(*) into v_count from public.host_reviews_due() d
  where d.booking_id = v_past_booking and d.guest_id = v_friend1 and d.booked_by = 'Booker C';
  if v_count <> 1 then raise exception 'companion row should say booked_by Booker C'; end if;

  perform public.post_review(v_past_booking, v_friend1, 5, 'Friend One was lovely to host', '{}', null);
  begin
    perform public.post_review(v_past_booking, v_friend1, 4, 'Friend One was lovely to host', '{}', null);
    raise exception 'host reviewed the same companion twice';
  exception when others then
    if sqlerrm not like '%already_reviewed%' then raise; end if;
  end;
  begin
    perform public.post_review(v_past_booking, v_stranger, 5, 'Never met this person', '{}', null);
    raise exception 'host reviewed someone not on the booking';
  exception when others then
    if sqlerrm not like '%not_allowed%' then raise; end if;
  end;

  execute 'set local role postgres';
  select public.review_is_public(r) into v_public from public.reviews r
  where r.booking_id = v_past_booking and r.reviewee_id = v_friend1;
  if v_public then raise exception 'companion review must stay hidden until the booker pair is in'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  perform public.post_review(v_past_booking, v_booker, 5, 'Booker C was great fun', '{}', null);
  perform set_config('request.jwt.claims', json_build_object('sub', v_booker::text, 'role', 'authenticated')::text, true);
  perform public.post_review(v_past_booking, v_host, 5, 'Lovely session', '{}', null);

  execute 'set local role postgres';
  select count(*) into v_count from public.reviews r
  where r.booking_id = v_past_booking and not public.review_is_public(r);
  if v_count <> 0 then raise exception 'all 3 reviews should be live once the booker pair is in'; end if;
  if not exists (select 1 from public.reviews_for_guest(v_friend1) g where g.comment like 'Friend One was lovely%') then
    raise exception 'companion profile should show the host review';
  end if;

  -- ---- A cancelled booking's link reads as cancelled. ----
  update public.bookings set status = 'cancelled' where id = v_future_booking;
  select p.state into v_state from public.join_preview(v_code2) p;
  if v_state <> 'cancelled' then raise exception 'cancelled booking preview should be cancelled, got %', v_state; end if;

  -- ---- Tables are closed to clients. ----
  execute 'set local role authenticated';
  begin
    perform 1 from public.booking_guests;
    raise exception 'authenticated can read booking_guests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.booking_join_codes;
    raise exception 'authenticated can read booking_join_codes';
  exception when insufficient_privilege then null;
  end;
  execute 'set local role postgres';
end;
$$;

rollback;
