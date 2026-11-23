-- Edit-until-revealed check. Run in the staging SQL Editor after 00058.
--
-- begin … rollback so nothing is kept. Acts as a guest, a host and a
-- stranger through set local role authenticated + request.jwt.claims.
-- Raises on failure; "DO" with no error means every check passed.

begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_session2 uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_booking2 uuid := gen_random_uuid();
  v_area text;
  v_guest_review uuid;
  v_guest_review2 uuid;
  v_host_review uuid;
  v_result jsonb;
  v_row public.reviews;
begin
  select name into v_area from public.planning_areas limit 1;

  insert into public.users (id, full_name, email, display_name, is_host)
  values
    (v_host, 'Host Edit', 'er-host-' || v_host || '@trykai.test', 'Host Edit', true),
    (v_guest, 'Guest Edit', 'er-guest-' || v_guest || '@trykai.test', 'Guest Edit', false),
    (v_stranger, 'Other Edit', 'er-other-' || v_stranger || '@trykai.test', 'Other Edit', false);

  insert into public.listings (
    id, host_id, title, description, category, price_per_person, max_guests, duration_mins, area, review_status, is_active
  ) values (
    v_listing, v_host, 'Edit check', 'A session used only inside this rollback.', 'Food', 2500, 4, 60, v_area, 'approved', true
  );

  insert into public.sessions (id, listing_id, starts_at, duration_mins, spots_total, spots_remaining, status)
  values
    (v_session, v_listing, now() - interval '2 hours', 60, 4, 3, 'open'),
    (v_session2, v_listing, now() - interval '5 hours', 60, 4, 3, 'open');

  insert into public.bookings (id, session_id, guest_id, guests_count, total_amount, platform_fee, status)
  values
    (v_booking, v_session, v_guest, 1, 2500, 300, 'confirmed'),
    (v_booking2, v_session2, v_guest, 1, 2500, 300, 'confirmed');

  -- Guest posts, then edits while hidden.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_guest::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_guest::text, true);

  v_result := public.post_review(v_booking, v_host, 3, 'First go', '{}', 'A note for TryKai');
  v_guest_review := (v_result ->> 'review_id')::uuid;

  v_result := public.edit_review(v_guest_review, 5, '  Second go, better  ', '{}');
  if coalesce((v_result ->> 'revealed')::boolean, true) then
    raise exception 'edit should report the review as still hidden';
  end if;

  -- A direct UPDATE is still not allowed.
  begin
    update public.reviews set rating = 1 where id = v_guest_review;
    raise exception 'direct UPDATE on reviews should be refused';
  exception
    when insufficient_privilege then
      null;
  end;

  execute 'set local role postgres';
  select r.* into v_row from public.reviews r where r.id = v_guest_review;
  if v_row.rating <> 5 or v_row.comment <> 'Second go, better' then
    raise exception 'edit did not save rating and trimmed comment: % %', v_row.rating, v_row.comment;
  end if;
  if v_row.edited_at is null then
    raise exception 'edit should set edited_at';
  end if;
  if v_row.revealed_at is not null or v_row.reveal_after is null then
    raise exception 'edit must not touch the reveal columns';
  end if;
  if not exists (select 1 from public.review_notes n where n.review_id = v_guest_review and n.note = 'A note for TryKai') then
    raise exception 'edit must leave the private note as posted';
  end if;

  -- Only the author: not a stranger, not the host.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  begin
    perform public.edit_review(v_guest_review, 1, 'hijack', '{}');
    raise exception 'stranger edit should have failed';
  exception
    when others then
      if sqlerrm not like '%not_allowed%' then
        raise;
      end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_host::text, true);
  begin
    perform public.edit_review(v_guest_review, 1, 'the host rewrites it', '{}');
    raise exception 'host edit of the guest review should have failed';
  exception
    when others then
      if sqlerrm not like '%not_allowed%' then
        raise;
      end if;
  end;

  -- Host review on the second booking: same rules as post_review.
  v_result := public.post_review(v_booking2, v_guest, 4, 'Lovely guest, on time', '{}', null);
  v_host_review := (v_result ->> 'review_id')::uuid;

  begin
    perform public.edit_review(v_host_review, 4, 'short', '{}');
    raise exception 'host edit under 10 characters should have failed';
  exception
    when others then
      if sqlerrm not like '%not_allowed%' then
        raise;
      end if;
  end;

  begin
    perform public.edit_review(v_host_review, 4, 'Lovely guest, on time', array[v_host::text || '/x.jpg']);
    raise exception 'host edit with photos should have failed';
  exception
    when others then
      if sqlerrm not like '%not_allowed%' then
        raise;
      end if;
  end;

  begin
    perform public.edit_review(v_host_review, 6, 'Lovely guest, on time', '{}');
    raise exception 'rating 6 should have failed';
  exception
    when others then
      if sqlerrm not like '%not_allowed%' then
        raise;
      end if;
  end;

  perform public.edit_review(v_host_review, 5, 'Lovely guest, early and kind', '{}');

  -- Host reviews the guest on the first booking: the pair reveals.
  v_result := public.post_review(v_booking, v_guest, 5, 'Great guest, asked good questions', '{}', null);
  if not coalesce((v_result ->> 'revealed')::boolean, false) then
    raise exception 'pair should reveal';
  end if;

  -- Now the guest's review is live and final.
  perform set_config('request.jwt.claims', json_build_object('sub', v_guest::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_guest::text, true);
  begin
    perform public.edit_review(v_guest_review, 1, 'changed my mind after reading theirs', '{}');
    raise exception 'edit after reveal should have failed';
  exception
    when others then
      if sqlerrm not like '%review_revealed%' then
        raise;
      end if;
  end;

  -- A lone review past reveal_after is live too.
  v_result := public.post_review(v_booking2, v_host, 4, 'Second booking', '{}', null);
  v_guest_review2 := (v_result ->> 'review_id')::uuid;
  -- That posted the pair on booking 2 as well, so reveal is set; undo it and
  -- push reveal_after into the past to test the window on its own.
  execute 'set local role postgres';
  update public.reviews
  set revealed_at = null, reveal_after = now() - interval '1 second'
  where id = v_guest_review2;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_guest::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_guest::text, true);
  begin
    perform public.edit_review(v_guest_review2, 2, 'too late', '{}');
    raise exception 'edit after the window should have failed';
  exception
    when others then
      if sqlerrm not like '%review_window_closed%' then
        raise;
      end if;
  end;

  execute 'set local role postgres';

  if has_function_privilege('anon', 'public.edit_review(uuid, integer, text, text[])', 'execute') then
    raise exception 'anon must not execute edit_review';
  end if;
end;
$$;

rollback;
