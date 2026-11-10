-- Host replies check. Run in the SQL Editor after 00055.
--
-- begin … rollback so nothing is kept. "ROLLBACK" with no error means every
-- check passed.

begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  v_other_host uuid := gen_random_uuid();
  g1 uuid := gen_random_uuid();
  g2 uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid();
  b2 uuid := gen_random_uuid();
  r_public uuid := gen_random_uuid();
  r_hidden uuid := gen_random_uuid();
  r_host uuid := gen_random_uuid();
  v_area text;
  v_body text;
  v_count integer;
  v_failed boolean;
begin
  select name into v_area from public.planning_areas limit 1;

  insert into public.users (id, full_name, email, display_name, is_host) values
    (v_host, 'Host R', 'rr-host-' || v_host || '@trykai.test', 'Host R', true),
    (v_other_host, 'Host X', 'rr-other-' || v_other_host || '@trykai.test', 'Host X', true),
    (g1, 'Guest One', 'rr-g1-' || g1 || '@trykai.test', 'Guest One', false),
    (g2, 'Guest Two', 'rr-g2-' || g2 || '@trykai.test', 'Guest Two', false);

  insert into public.listings (
    id, host_id, title, description, category, price_per_person, max_guests, duration_mins,
    area, review_status, is_active, full_address
  ) values (
    v_listing, v_host, 'Reply check', 'A session used only inside this rollback.', 'Food', 1500, 10, 60,
    v_area, 'approved', true, 'Blk 1 Check Street'
  );

  insert into public.sessions (id, listing_id, starts_at, duration_mins, spots_total, spots_remaining, status)
  values (v_session, v_listing, now() - interval '3 days', 60, 10, 8, 'completed');

  insert into public.bookings (id, session_id, guest_id, guests_count, total_amount, platform_fee, status) values
    (b1, v_session, g1, 1, 1800, 300, 'completed'),
    (b2, v_session, g2, 1, 1800, 300, 'completed');

  -- One public guest review, one still hidden, and the host's review of g1.
  insert into public.reviews (id, booking_id, reviewer_id, reviewee_id, rating, comment, role) values
    (r_public, b1, g1, v_host, 5, 'Loved it', 'guest'),
    (r_hidden, b2, g2, v_host, 4, 'Nice', 'guest'),
    (r_host, b1, v_host, g1, 5, 'Great guest', 'host');
  update public.reviews set revealed_at = now() where id in (r_public, r_host);
  update public.reviews set revealed_at = null, reveal_after = now() + interval '7 days' where id = r_hidden;

  -- ---- The host replies, then edits. One reply per review. ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);
  select body into v_body from public.reply_to_review(r_public, '  Thank you for coming!  ');
  if v_body <> 'Thank you for coming!' then
    raise exception 'reply should be saved trimmed, got %', v_body;
  end if;
  perform public.reply_to_review(r_public, 'Thanks, see you again');
  select count(*) into v_count from public.review_replies where review_id = r_public;
  if v_count <> 1 or (select body from public.review_replies where review_id = r_public) <> 'Thanks, see you again' then
    raise exception 'an edit should replace the reply';
  end if;

  -- ---- Not while the review is hidden, not empty, not too long, not the host review. ----
  v_failed := false;
  begin perform public.reply_to_review(r_hidden, 'Too early'); exception when others then v_failed := true; end;
  if not v_failed then raise exception 'no reply before the review is public'; end if;
  v_failed := false;
  begin perform public.reply_to_review(r_public, '   '); exception when others then v_failed := true; end;
  if not v_failed then raise exception 'an empty reply should be refused'; end if;
  v_failed := false;
  begin perform public.reply_to_review(r_public, repeat('a', 601)); exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a reply over 600 characters should be refused'; end if;
  v_failed := false;
  begin perform public.reply_to_review(r_host, 'Replying to myself'); exception when others then v_failed := true; end;
  if not v_failed then raise exception 'no replies to host reviews'; end if;

  -- ---- Another host or the guest cannot reply or delete. ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_host, 'role', 'authenticated')::text, true);
  v_failed := false;
  begin perform public.reply_to_review(r_public, 'Not my session'); exception when others then v_failed := true; end;
  if not v_failed then raise exception 'another host must not reply'; end if;
  if public.delete_review_reply(r_public) then raise exception 'another host must not delete the reply'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', g1, 'role', 'authenticated')::text, true);
  v_failed := false;
  begin perform public.reply_to_review(r_public, 'Guest answering back'); exception when others then v_failed := true; end;
  if not v_failed then raise exception 'the guest must not reply'; end if;

  -- ---- Reading: public review replies only, with the host name. ----
  insert into public.review_replies (review_id, host_id, body) values (r_hidden, v_host, 'Planted under a hidden review');
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into v_count from public.review_replies(array[r_public, r_hidden]);
  if v_count <> 1 then
    raise exception 'only the reply under the public review should come back, got %', v_count;
  end if;
  if (select host_display_name from public.review_replies(array[r_public])) <> 'Host R' then
    raise exception 'reply should carry the host name';
  end if;
  if (select count(*) from public.review_replies(null)) <> 0 then
    raise exception 'no ids should return nothing';
  end if;

  -- ---- The host deletes. ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);
  if not public.delete_review_reply(r_public) then raise exception 'host should delete their reply'; end if;
  if exists (select 1 from public.review_replies where review_id = r_public) then
    raise exception 'reply should be gone';
  end if;

  -- ---- Grants. ----
  if has_table_privilege('anon', 'public.review_replies', 'select')
     or has_table_privilege('authenticated', 'public.review_replies', 'insert')
     or has_table_privilege('authenticated', 'public.review_replies', 'update') then
    raise exception 'clients must not touch review_replies directly';
  end if;
  if not has_function_privilege('anon', 'public.review_replies(uuid[])', 'execute') then
    raise exception 'anyone should read replies';
  end if;
  if has_function_privilege('anon', 'public.reply_to_review(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.delete_review_reply(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.review_host_id(uuid)', 'execute') then
    raise exception 'anon must not write replies';
  end if;

  raise notice 'review replies check passed';
end $$;

rollback;
