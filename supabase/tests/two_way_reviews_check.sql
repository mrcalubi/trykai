-- Two-way reviews check. Run in the staging SQL Editor after 00048
-- (and the 00049 block after that lock is applied).
--
-- begin … rollback so nothing is kept. Uses set local role authenticated and
-- request.jwt.claims to act as a guest, a host, and anon. Raises on failure.

begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_old_session uuid := gen_random_uuid();
  v_old_booking uuid := gen_random_uuid();
  v_area text;
  v_guest_review uuid;
  v_host_review uuid;
  v_result jsonb;
  v_public boolean;
  v_avg numeric;
  v_count int;
  v_locked boolean;
begin
  select name into v_area from public.planning_areas limit 1;

  insert into public.users (id, full_name, email, display_name, is_host)
  values
    (v_host, 'Host Check', 'twr-host-' || v_host || '@trykai.test', 'Host Check', true),
    (v_guest, 'Guest Check', 'twr-guest-' || v_guest || '@trykai.test', 'Guest Check', false),
    (v_stranger, 'Other Check', 'twr-other-' || v_stranger || '@trykai.test', 'Other Check', false);

  insert into public.listings (
    id, host_id, title, description, category, price_per_person, max_guests, duration_mins, area, review_status, is_active
  ) values (
    v_listing, v_host, 'TWR check', 'A session used only inside this rollback.', 'Food', 2500, 4, 60, v_area, 'approved', true
  );

  insert into public.sessions (id, listing_id, starts_at, duration_mins, spots_total, spots_remaining, status)
  values (
    v_session, v_listing, now() - interval '2 hours', 60, 4, 3, 'open'
  );

  insert into public.bookings (id, session_id, guest_id, guests_count, total_amount, platform_fee, status)
  values (v_booking, v_session, v_guest, 1, 2500, 300, 'confirmed');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_guest::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_guest::text, true);

  v_result := public.post_review(v_booking, v_host, 5, 'Guest words here', '{}', null);
  v_guest_review := (v_result ->> 'review_id')::uuid;
  if v_guest_review is null then
    raise exception 'guest post_review did not return a review_id';
  end if;
  if coalesce((v_result ->> 'revealed')::boolean, true) then
    raise exception 'guest-only review must stay hidden';
  end if;

  begin
    perform public.post_review(v_booking, v_host, 4, 'again', '{}', null);
    raise exception 'second guest post should have failed';
  exception
    when others then
      if sqlerrm not like '%already_reviewed%' then
        raise;
      end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  begin
    perform public.post_review(v_booking, v_host, 5, 'nope', '{}', null);
    raise exception 'stranger post should have failed';
  exception
    when others then
      if sqlerrm not like '%not_allowed%' then
        raise;
      end if;
  end;

  execute 'set local role postgres';

  select public.review_is_public(r) into v_public from public.reviews r where r.id = v_guest_review;
  if v_public then
    raise exception 'lone guest review must not be public yet';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_host::text, true);

  v_result := public.post_review(v_booking, v_guest, 5, 'Host words about the guest', '{}', 'Kitchen was chilly');
  v_host_review := (v_result ->> 'review_id')::uuid;
  if not coalesce((v_result ->> 'revealed')::boolean, false) then
    raise exception 'pair should reveal both reviews';
  end if;

  begin
    perform public.post_review(v_booking, v_guest, 4, 'Host words about the guest', '{}', null);
    raise exception 'second host post should have failed';
  exception
    when others then
      if sqlerrm not like '%already_reviewed%' then
        raise;
      end if;
  end;

  execute 'set local role postgres';
  select public.review_is_public(r) into v_public from public.reviews r where r.id = v_guest_review;
  if not v_public then
    raise exception 'guest review should be public after both sides post';
  end if;
  select public.review_is_public(r) into v_public from public.reviews r where r.id = v_host_review;
  if not v_public then
    raise exception 'host review should be public after both sides post';
  end if;

  if not exists (select 1 from public.reviews_for_guest(v_guest) g where g.comment like 'Host words%') then
    raise exception 'reviews_for_guest should return the host comment';
  end if;
  if pg_get_function_result('public.reviews_for_guest(uuid)') like '%rating%' then
    raise exception 'reviews_for_guest must never return rating';
  end if;

  insert into public.sessions (id, listing_id, starts_at, duration_mins, spots_total, spots_remaining, status)
  values (v_old_session, v_listing, now() - interval '10 days', 60, 4, 3, 'open');
  insert into public.bookings (id, session_id, guest_id, guests_count, total_amount, platform_fee, status)
  values (v_old_booking, v_old_session, v_guest, 1, 2500, 300, 'confirmed');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_guest::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_guest::text, true);
  begin
    perform public.post_review(v_old_booking, v_host, 5, 'too late', '{}', null);
    raise exception 'closed window post should have failed';
  exception
    when others then
      if sqlerrm not like '%review_window_closed%' then
        raise;
      end if;
  end;

  execute 'set local role postgres';

  -- A lone review becomes public after reveal_after.
  update public.reviews
  set revealed_at = null, reveal_after = now() - interval '1 second'
  where id = v_guest_review;
  select public.review_is_public(r) into v_public from public.reviews r where r.id = v_guest_review;
  if not v_public then
    raise exception 'review_is_public should be true after reveal_after';
  end if;

  -- Hidden reviews must not count in host_rating / listing_ratings.
  update public.reviews
  set revealed_at = null, reveal_after = now() + interval '2 days'
  where id in (v_guest_review, v_host_review);
  select average, review_count into v_avg, v_count from public.host_rating(v_host);
  if coalesce(v_count, 0) <> 0 then
    raise exception 'host_rating counted a hidden review';
  end if;
  select review_count into v_count from public.listing_ratings(array[v_listing]);
  if coalesce(v_count, 0) <> 0 then
    raise exception 'listing_ratings counted a hidden review';
  end if;

  v_locked := exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'Reviewers can read their own reviews'
  ) and not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'Anyone can view reviews'
  );

  -- A host can feature a public guest review of themselves. Runs as the host
  -- so it also proves the guard works once 00049 hides other people's rows.
  update public.reviews set revealed_at = now() where id = v_guest_review;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_host::text, true);
  update public.users set featured_review_id = v_guest_review where id = v_host;
  if not found then
    raise exception 'host could not feature their own public guest review';
  end if;

  -- A stranger gets no review state for someone else's booking.
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  if exists (select 1 from public.my_review_state(v_booking)) then
    raise exception 'my_review_state must return nothing to a stranger';
  end if;
  execute 'set local role postgres';

  if v_locked then
    execute 'set local role anon';
    begin
      perform 1 from public.reviews;
      raise exception 'anon should not select reviews after 00049';
    exception
      when insufficient_privilege then
        null;
    end;

    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_guest::text, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_guest::text, true);
    if exists (select 1 from public.reviews r where r.reviewer_id <> v_guest) then
      raise exception 'authenticated must only see own review rows after 00049';
    end if;
  end if;
end;
$$;

rollback;
