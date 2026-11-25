-- Listing locations check. Run in the SQL Editor after 00059.
--
-- begin … rollback so nothing is kept. "ROLLBACK" with no error means every
-- check passed.

begin;

-- Act as a signed-in user, the service role, or nobody. Sets both the claims
-- JSON (hosted Supabase) and the single claims (older local images).
create function pg_temp.act_as(p_sub uuid, p_role text) returns void language sql as $$
  select set_config('request.jwt.claims',
           coalesce(json_build_object('sub', p_sub, 'role', p_role)::text, ''), true),
         set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true),
         set_config('request.jwt.claim.role', coalesce(p_role, ''), true);
$$;

do $$
declare
  v_host uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_guest2 uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_solo uuid := gen_random_uuid();
  v_foreign uuid := gen_random_uuid();
  l_tampines uuid;
  l_jurong uuid;
  l_solo uuid;
  l_foreign uuid;
  s_tampines uuid;
  s_jurong uuid;
  s_solo uuid;
  s_move uuid;
  b_tampines uuid;
  b_jurong uuid;
  v_result jsonb;
  v_text text;
  v_failed boolean;
  v_at timestamptz := date_trunc('hour', now()) + interval '5 days';
begin
  insert into public.users (id, full_name, email, display_name, is_host) values
    (v_host, 'Host L', 'll-host-' || v_host || '@trykai.test', 'Host L', true),
    (v_guest, 'Guest T', 'll-guest-' || v_guest || '@trykai.test', 'Guest T', false),
    (v_guest2, 'Guest J', 'll-guest2-' || v_guest2 || '@trykai.test', 'Guest J', false),
    (v_other, 'Host O', 'll-other-' || v_other || '@trykai.test', 'Host O', true);
  update public.users set verification_status = 'approved' where id = v_host;

  insert into public.listings (
    id, host_id, title, description, category, price_per_person, max_guests, duration_mins,
    area, full_address, arrival_instructions, review_status, is_active
  ) values
    (v_listing, v_host, 'Locations check', 'Used only inside this rollback.', 'Arts', 2500, 4, 60,
     'Tampines', 'Blk 1 Tampines Street', 'Level 2', 'approved', true),
    (v_solo, v_host, 'Solo check', 'Used only inside this rollback.', 'Arts', 2500, 4, 60,
     'Bedok', 'Blk 9 Bedok Road', null, 'approved', true),
    (v_foreign, v_other, 'Other host', 'Used only inside this rollback.', 'Arts', 2500, 4, 60,
     'Bedok', 'Blk 7 Other Road', null, 'approved', true);

  -- ---- Every new listing gets one location from its own columns. ----
  select id into l_tampines from public.listing_locations where listing_id = v_listing;
  select id into l_solo from public.listing_locations where listing_id = v_solo;
  select id into l_foreign from public.listing_locations where listing_id = v_foreign;
  if l_tampines is null
     or (select (area, full_address, arrival_instructions) from public.listing_locations where id = l_tampines)
        is distinct from ('Tampines'::text, 'Blk 1 Tampines Street'::text, 'Level 2'::text) then
    raise exception 'a new listing should get its place as its first location';
  end if;

  -- ---- A second location needs multiple locations turned on. ----
  v_failed := false;
  begin
    insert into public.listing_locations (listing_id, area, full_address, position)
    values (v_listing, 'Jurong East', 'Blk 2 Jurong Street', 1);
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a second location should need multiple locations turned on'; end if;

  update public.listings set multi_location = true where id = v_listing;
  if (select multi_location_confirmed_at from public.listings where id = v_listing) is null then
    raise exception 'turning on multiple locations should record when';
  end if;

  insert into public.listing_locations (listing_id, label, area, full_address, arrival_instructions, position)
  values (v_listing, 'Jurong studio', 'Jurong East', 'Blk 2 Jurong Street', 'Unit 5', 1)
  returning id into l_jurong;

  -- ---- At most 4 active locations. ----
  insert into public.listing_locations (listing_id, area, position)
  values (v_listing, 'Bedok', 2), (v_listing, 'Bishan', 3);
  v_failed := false;
  begin
    insert into public.listing_locations (listing_id, area, position) values (v_listing, 'Clementi', 4);
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a fifth active location should be refused'; end if;
  update public.listing_locations set is_active = false
  where listing_id = v_listing and area in ('Bedok', 'Bishan');

  v_failed := false;
  begin
    update public.listings set multi_location = false where id = v_listing;
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'turning off multiple locations should need one location left'; end if;

  -- ---- The first location and the listing columns stay equal, both ways. ----
  update public.listings set full_address = 'Blk 1A Tampines Street' where id = v_listing;
  if (select full_address from public.listing_locations where id = l_tampines) is distinct from 'Blk 1A Tampines Street' then
    raise exception 'editing the listing address should update its first location';
  end if;
  update public.listing_locations set arrival_instructions = 'Level 3' where id = l_tampines;
  if (select arrival_instructions from public.listings where id = v_listing) is distinct from 'Level 3' then
    raise exception 'editing the first location should update the listing';
  end if;
  update public.listing_locations set full_address = 'Blk 2A Jurong Street' where id = l_jurong;
  if (select full_address from public.listings where id = v_listing) is distinct from 'Blk 1A Tampines Street' then
    raise exception 'editing another location must not change the listing columns';
  end if;

  -- ---- Sessions carry a location. ----
  v_failed := false;
  begin
    insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status)
    values (v_listing, v_at, 60, 4, 4, 'open');
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a session without a location should be refused when there are several'; end if;

  insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, location_id)
  values (v_listing, v_at, 60, 4, 4, 'open', l_tampines)
  returning id into s_tampines;

  begin
    insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, location_id)
    values (v_listing, v_at, 60, 4, 4, 'open', l_jurong)
    returning id into s_jurong;
  exception when others then
    raise exception 'the same time at another location should be allowed (%)', sqlerrm;
  end;

  v_failed := false;
  begin
    insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, location_id)
    values (v_listing, v_at + interval '30 minutes', 60, 4, 4, 'open', l_tampines);
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'an overlapping time at the same location should be refused'; end if;

  v_failed := false;
  begin
    insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, location_id)
    values (v_listing, v_at + interval '1 day', 60, 4, 4, 'open', l_foreign);
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'another listing''s location should be refused'; end if;

  v_failed := false;
  begin
    insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, location_id)
    values (v_listing, v_at + interval '1 day', 60, 4, 4, 'open',
            (select id from public.listing_locations where listing_id = v_listing and area = 'Bedok'));
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a removed location should be refused for new sessions'; end if;

  insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status)
  values (v_solo, v_at, 60, 4, 4, 'open')
  returning id into s_solo;
  if (select location_id from public.sessions where id = s_solo) is distinct from l_solo then
    raise exception 'a one-location listing should fill in its location';
  end if;

  v_failed := false;
  begin
    update public.sessions set location_id = l_tampines where id = s_jurong;
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a session''s location must not change'; end if;

  -- ---- Holds: a booking in Tampines leaves Jurong East open. ----
  insert into public.bookings (session_id, guest_id, guests_count, total_amount, platform_fee, status)
  values (s_tampines, v_guest, 1, 2800, 300, 'pending')
  returning id into b_tampines;
  insert into public.bookings (session_id, guest_id, guests_count, total_amount, platform_fee, status)
  values (s_jurong, v_guest2, 1, 2800, 300, 'pending')
  returning id into b_jurong;

  perform pg_temp.act_as(null, 'service_role');
  perform public.confirm_paid_booking(b_tampines);
  if (select status from public.sessions where id = s_jurong) is distinct from 'open' then
    raise exception 'a booking in one location must not hold another location at the same time';
  end if;
  if (select status from public.sessions where id = s_solo) is distinct from 'held' then
    raise exception 'a booking should still hold the host''s other listings at that time';
  end if;
  begin
    perform public.confirm_paid_booking(b_jurong);
  exception when others then
    raise exception 'another location should still take bookings at the same time (%)', sqlerrm;
  end;
  if (select status from public.bookings where id = b_jurong) is distinct from 'confirmed' then
    raise exception 'another location should still take bookings at the same time';
  end if;

  -- ---- Who sees which address. ----
  perform pg_temp.act_as(v_guest, 'authenticated');
  if (select full_address from public.listing_location_details(v_listing) d where d.id = l_tampines)
     is distinct from 'Blk 1A Tampines Street' then
    raise exception 'a guest should see the address of the location they booked';
  end if;
  if (select full_address from public.listing_location_details(v_listing) d where d.id = l_jurong) is not null
     or (select arrival_instructions from public.listing_location_details(v_listing) d where d.id = l_jurong) is not null then
    raise exception 'a guest must not see the address of a location they did not book';
  end if;
  if (select count(*) from public.listing_location_details(v_listing)) <> 2 then
    raise exception 'guests should see the two active locations, not removed ones';
  end if;
  if public.listing_address(v_listing) is distinct from 'Blk 1A Tampines Street'
     or public.listing_arrival_instructions(v_listing) is distinct from 'Level 3' then
    raise exception 'listing_address should give a guest the location they booked';
  end if;

  perform pg_temp.act_as(v_guest2, 'authenticated');
  if public.listing_address(v_listing) is distinct from 'Blk 2A Jurong Street'
     or public.listing_arrival_instructions(v_listing) is distinct from 'Unit 5' then
    raise exception 'listing_address should give the Jurong East guest the Jurong East address';
  end if;

  perform pg_temp.act_as(v_host, 'authenticated');
  -- Tampines and Jurong East have addresses; the two removed test rows do not.
  if (select count(*) from public.listing_location_details(v_listing)) <> 4
     or (select count(*) from public.listing_location_details(v_listing) d where d.full_address is not null) <> 2 then
    raise exception 'the host should see every location and address, removed ones too';
  end if;
  if public.listing_address(v_listing) is distinct from 'Blk 1A Tampines Street' then
    raise exception 'listing_address should give the host the first location';
  end if;

  perform pg_temp.act_as(v_other, 'authenticated');
  if exists (select 1 from public.listing_location_details(v_listing) d where d.full_address is not null)
     or public.listing_address(v_listing) is not null then
    raise exception 'someone without a booking must not see any address';
  end if;

  perform pg_temp.act_as(null, null);
  if exists (select 1 from public.listing_location_details(v_listing) d where d.full_address is not null) then
    raise exception 'a signed-out visitor must not see any address';
  end if;

  -- ---- Removing a location. ----
  v_failed := false;
  begin
    update public.listing_locations set is_active = false where id = l_jurong;
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a location with upcoming dates cannot be removed'; end if;
  v_failed := false;
  begin
    update public.listing_locations set is_active = false where id = l_solo;
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'the last location cannot be removed'; end if;

  -- ---- Host RPCs. ----
  perform pg_temp.act_as(v_host, 'authenticated');
  if public.can_create_listing() then
    v_failed := false;
    begin perform public.add_listing_session(v_listing, v_at + interval '1 day', 4);
    exception when others then v_failed := true; end;
    if not v_failed then raise exception 'add_listing_session without a location should be refused when there are several'; end if;

    v_result := public.add_listing_session(v_listing, v_at + interval '1 day', 4, null, l_jurong);
    if (v_result->>'location_id')::uuid is distinct from l_jurong then
      raise exception 'add_listing_session should create the session at the location given';
    end if;
    begin
      perform public.add_listing_session(v_listing, v_at + interval '1 day', 4, null, l_tampines);
    exception when others then
      raise exception 'add_listing_session should allow the same time at another location (%)', sqlerrm;
    end;
    v_failed := false;
    begin perform public.add_listing_session(v_listing, v_at + interval '1 day', 4, null, l_jurong);
    exception when others then v_failed := true; v_text := sqlerrm; end;
    if not v_failed or v_text is distinct from 'That time is already on.' then
      raise exception 'the same time at the same location should be refused as already on';
    end if;

    v_result := public.add_listing_session(v_solo, v_at + interval '1 day', 4);
    if (select location_id from public.sessions where id = (v_result->>'session_id')::uuid) is distinct from l_solo then
      raise exception 'the four-argument call should still work on a one-location listing';
    end if;
  else
    raise notice 'skipped add_listing_session checks: this host cannot create listings in this database';
  end if;

  -- Moving an empty date onto another location's time is fine.
  insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, location_id)
  values (v_listing, v_at + interval '3 days', 60, 4, 4, 'open', l_jurong)
  returning id into s_move;
  insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, location_id)
  values (v_listing, v_at + interval '2 days', 60, 4, 4, 'open', l_tampines);
  begin
    perform public.edit_open_session(s_move, v_at + interval '2 days');
  exception when others then
    raise exception 'moving a date onto another location''s time should be allowed (%)', sqlerrm;
  end;
  v_failed := false;
  begin perform public.edit_open_session(s_move, v_at);
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'moving a date onto a booked time at its own location should be refused'; end if;

  -- ---- Today's Create and Edit listing writes, as the signed-in host. ----
  perform pg_temp.act_as(v_host, 'authenticated');
  if public.can_create_listing() then
    set local role authenticated;
    begin
      insert into public.listings (
        host_id, title, description, category, price_per_person, max_guests, duration_mins,
        area, full_address, arrival_instructions
      ) values (
        v_host, 'App check', 'Used only inside this rollback.', 'Arts', 2500, 4, 60,
        'Bishan', 'Blk 5 Bishan Street', 'Gate C'
      ) returning id into v_solo;
      update public.listings set full_address = 'Blk 5A Bishan Street' where id = v_solo;
      insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status)
      values (v_solo, v_at + interval '6 days', 90, 4, 4, 'open')
      returning id into s_move;
    exception when others then
      reset role;
      raise exception 'the current Create and Edit listing writes should still work as the host (%)', sqlerrm;
    end;
    reset role;
    if (select count(*) from public.listing_locations where listing_id = v_solo) <> 1
       or (select full_address from public.listing_locations where listing_id = v_solo) is distinct from 'Blk 5A Bishan Street'
       or (select location_id from public.sessions where id = s_move)
          is distinct from (select id from public.listing_locations where listing_id = v_solo) then
      raise exception 'a listing made and edited in the app should keep one location in step';
    end if;
  else
    raise notice 'skipped app-write checks: this host cannot create listings in this database';
  end if;

  -- ---- Row security and grants. ----
  perform pg_temp.act_as(v_other, 'authenticated');
  set local role authenticated;
  v_failed := false;
  begin
    insert into public.listing_locations (listing_id, area) values (v_listing, 'Bishan');
  exception when others then v_failed := true; end;
  if not v_failed then
    reset role;
    raise exception 'another host must not add a location to this listing';
  end if;
  v_failed := false;
  begin
    perform full_address from public.listing_locations where id = l_tampines;
  exception when others then v_failed := true; end;
  reset role;
  if not v_failed then raise exception 'clients must not read location addresses directly'; end if;

  if has_column_privilege('anon', 'public.listing_locations', 'full_address', 'select')
     or has_column_privilege('authenticated', 'public.listing_locations', 'full_address', 'select')
     or has_column_privilege('authenticated', 'public.listing_locations', 'arrival_instructions', 'select') then
    raise exception 'location addresses must not be readable directly';
  end if;
  if not has_column_privilege('anon', 'public.listing_locations', 'area', 'select') then
    raise exception 'anyone should read a location''s area';
  end if;
  if has_table_privilege('authenticated', 'public.listing_locations', 'delete')
     or has_column_privilege('authenticated', 'public.listing_locations', 'listing_id', 'update') then
    raise exception 'location writes are too open';
  end if;
  if has_column_privilege('authenticated', 'public.sessions', 'location_id', 'update') then
    raise exception 'clients must not change a session''s location';
  end if;
  if has_column_privilege('authenticated', 'public.listings', 'multi_location_confirmed_at', 'update') then
    raise exception 'only the trigger may record when multiple locations were turned on';
  end if;
  if has_function_privilege('anon', 'public.add_listing_session(uuid, timestamptz, integer, uuid, uuid)', 'execute') then
    raise exception 'anon must not add sessions';
  end if;

  raise notice 'listing locations check passed';
end $$;

rollback;
