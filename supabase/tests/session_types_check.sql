-- Session types check. Run in the SQL Editor after 00056.
--
-- begin … rollback so nothing is kept. "ROLLBACK" with no error means every
-- check passed.

begin;

do $$
declare
  v_host uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_listing2 uuid := gen_random_uuid();
  t_bouquet uuid;
  t_centre uuid;
  t_other uuid;
  v_area text;
  v_result jsonb;
  v_session uuid;
  v_failed boolean;
  v_at timestamptz := date_trunc('hour', now()) + interval '5 days';
begin
  select name into v_area from public.planning_areas limit 1;

  insert into public.users (id, full_name, email, display_name, is_host) values
    (v_host, 'Host T', 'st-host-' || v_host || '@trykai.test', 'Host T', true),
    (v_other, 'Host O', 'st-other-' || v_other || '@trykai.test', 'Host O', true);
  update public.users set verification_status = 'approved' where id = v_host;

  insert into public.listings (
    id, host_id, title, description, category, price_per_person, max_guests, duration_mins,
    area, review_status, is_active, full_address
  ) values
    (v_listing, v_host, 'Types check', 'Used only inside this rollback.', 'Arts', 2500, 8, 90,
     v_area, 'approved', true, 'Blk 1 Check Street'),
    (v_listing2, v_other, 'Other listing', 'Used only inside this rollback.', 'Arts', 2500, 8, 90,
     v_area, 'approved', true, 'Blk 2 Check Street');

  insert into public.listing_session_types (listing_id, name, description, position)
  values (v_listing, 'Hand-tied bouquet', 'Take home a bouquet.', 0) returning id into t_bouquet;
  insert into public.listing_session_types (listing_id, name, position)
  values (v_listing, 'Table centrepiece', 1) returning id into t_centre;
  insert into public.listing_session_types (listing_id, name)
  values (v_listing2, 'Not yours') returning id into t_other;

  -- ---- At most 4 active types; a removed one frees a slot. ----
  insert into public.listing_session_types (listing_id, name) values (v_listing, 'Three'), (v_listing, 'Four');
  v_failed := false;
  begin
    insert into public.listing_session_types (listing_id, name) values (v_listing, 'Five');
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a fifth active type should be refused'; end if;
  update public.listing_session_types set is_active = false where listing_id = v_listing and name = 'Four';
  insert into public.listing_session_types (listing_id, name) values (v_listing, 'Five');

  -- ---- Photos only from the host's folder; names 1 to 40 characters. ----
  v_failed := false;
  begin
    update public.listing_session_types
    set photo_url = 'https://x.supabase.co/storage/v1/object/public/listing-photos/' || v_other || '/a.jpg'
    where id = t_bouquet;
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a photo from another host''s folder should be refused'; end if;
  update public.listing_session_types
  set photo_url = 'https://x.supabase.co/storage/v1/object/public/listing-photos/' || v_host || '/a.jpg'
  where id = t_bouquet;
  v_failed := false;
  begin
    insert into public.listing_session_types (listing_id, name) values (v_listing2, repeat('x', 41));
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a 41-character name should be refused'; end if;

  -- ---- Adding sessions with a type, as the host. ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_host, 'role', 'authenticated')::text, true);
  -- can_create_listing() needs an approved host; skip the RPC if this host is not.
  if public.can_create_listing() then
    v_result := public.add_listing_session(v_listing, v_at, 4, t_bouquet);
    v_session := (v_result->>'session_id')::uuid;
    if (select type_id from public.sessions where id = v_session) is distinct from t_bouquet then
      raise exception 'the new session should carry its type';
    end if;
    -- Same time, same type: spots are added.
    v_result := public.add_listing_session(v_listing, v_at, 2, t_bouquet);
    if v_result->>'action' <> 'merged' then raise exception 'same type at the same time should merge'; end if;
    -- Same time, different type: refused.
    v_failed := false;
    begin perform public.add_listing_session(v_listing, v_at, 2, t_centre);
    exception when others then v_failed := true; end;
    if not v_failed then raise exception 'a different type at the same time should be refused'; end if;
    -- The old three-argument call still works.
    v_result := public.add_listing_session(v_listing, v_at + interval '1 day', 2);
    if (select type_id from public.sessions where id = (v_result->>'session_id')::uuid) is not null then
      raise exception 'no type given should leave type_id empty';
    end if;
  else
    raise notice 'skipped add_listing_session checks: this host cannot create listings in this database';
  end if;

  -- ---- The trigger: another listing's type, or a removed type, is refused. ----
  v_failed := false;
  begin
    insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, type_id)
    values (v_listing, v_at + interval '2 days', 90, 4, 4, 'open', t_other);
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'another listing''s type should be refused'; end if;
  v_failed := false;
  begin
    insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, type_id)
    values (v_listing, v_at + interval '3 days', 90, 4, 4, 'open',
            (select id from public.listing_session_types where listing_id = v_listing and name = 'Four'));
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'a removed type should be refused for new sessions'; end if;
  insert into public.sessions (listing_id, starts_at, duration_mins, spots_total, spots_remaining, status, type_id)
  values (v_listing, v_at + interval '4 days', 90, 4, 4, 'open', t_centre)
  returning id into v_session;

  -- Removing a type keeps it on its sessions.
  update public.listing_session_types set is_active = false where id = t_centre;
  if (select type_id from public.sessions where id = v_session) is distinct from t_centre then
    raise exception 'removing a type must not clear it from sessions';
  end if;

  -- ---- Grants. ----
  if not has_column_privilege('anon', 'public.listing_session_types', 'name', 'select') then
    raise exception 'anyone should read session types';
  end if;
  if has_table_privilege('anon', 'public.listing_session_types', 'insert')
     or has_table_privilege('authenticated', 'public.listing_session_types', 'delete')
     or has_column_privilege('authenticated', 'public.listing_session_types', 'listing_id', 'update') then
    raise exception 'session type writes are too open';
  end if;
  if has_column_privilege('authenticated', 'public.sessions', 'type_id', 'update') then
    raise exception 'clients must not change a session''s type';
  end if;
  if not has_column_privilege('authenticated', 'public.sessions', 'type_id', 'insert') then
    raise exception 'hosts should set the type when adding a session';
  end if;
  if has_function_privilege('anon', 'public.add_listing_session(uuid, timestamptz, integer, uuid)', 'execute') then
    raise exception 'anon must not add sessions';
  end if;

  raise notice 'session types check passed';
end $$;

rollback;
