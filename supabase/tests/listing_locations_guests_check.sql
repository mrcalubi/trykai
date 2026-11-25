-- Listing locations, guest side check. Run in the SQL Editor after 00060.
--
-- begin … rollback so nothing is kept. "ROLLBACK" with no error means every
-- check passed.

begin;

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
  v_friend uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  l_jurong uuid;
  s_jurong uuid;
  b_jurong uuid;
  v_area text;
  v_item jsonb;
begin
  insert into public.users (id, full_name, email, display_name, is_host) values
    (v_host, 'Host G', 'lg-host-' || v_host || '@trykai.test', 'Host G', true),
    (v_guest, 'Guest G', 'lg-guest-' || v_guest || '@trykai.test', 'Guest G', false),
    (v_friend, 'Friend G', 'lg-friend-' || v_friend || '@trykai.test', 'Friend G', false);

  insert into public.listings (
    id, host_id, title, description, category, price_per_person, max_guests, duration_mins,
    area, full_address, review_status, is_active, multi_location
  ) values (
    v_listing, v_host, 'Guests check', 'Used only inside this rollback.', 'Arts', 2500, 4, 60,
    'Tampines', 'Blk 1 Tampines Street', 'approved', true, true
  );
  insert into public.listing_locations (listing_id, label, area, full_address, position)
  values (v_listing, 'Jurong studio', 'Jurong East', 'Blk 2 Jurong Street', 1)
  returning id into l_jurong;

  insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, location_id)
  values (v_listing, date_trunc('hour', now()) + interval '5 days', 60, 4, 4, 'open', l_jurong)
  returning id into s_jurong;
  insert into public.bookings (session_id, guest_id, guests_count, total_amount, platform_fee, status)
  values (s_jurong, v_guest, 2, 5600, 600, 'confirmed')
  returning id into b_jurong;
  insert into public.booking_join_codes (booking_id, code) values (b_jurong, 'abcdef0123456789abcd');

  -- ---- The invite shows the booked place's area, not the listing's first. ----
  perform pg_temp.act_as(v_friend, 'authenticated');
  select p.area into v_area from public.join_preview('abcdef0123456789abcd') p;
  if v_area is distinct from 'Jurong East' then
    raise exception 'join_preview should show the area of the booked location (got %)', v_area;
  end if;

  -- ---- A friend's copy of the booking carries its location. ----
  insert into public.booking_guests (booking_id, user_id) values (b_jurong, v_friend);
  v_item := public.companion_booking(b_jurong);
  if (v_item -> 'sessions' ->> 'location_id')::uuid is distinct from l_jurong then
    raise exception 'companion_booking should carry the session location';
  end if;
  v_item := public.my_companion_bookings() -> 0;
  if (v_item -> 'sessions' ->> 'location_id')::uuid is distinct from l_jurong then
    raise exception 'my_companion_bookings should carry the session location';
  end if;
  -- And the friend sees that place's address, the same as the booker.
  if (select d.full_address from public.listing_location_details(v_listing) d where d.id = l_jurong)
     is distinct from 'Blk 2 Jurong Street' then
    raise exception 'a friend on the booking should see the booked location address';
  end if;

  raise notice 'listing locations guests check passed';
end $$;

rollback;
