-- Marketing consent check. Run in the SQL Editor after 00054.
--
-- begin … rollback so nothing is kept. "ROLLBACK" with no error means every
-- check passed.

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  v_token uuid;
  v_ok boolean;
begin
  -- Existing accounts were opted in.
  if exists (select 1 from public.users where marketing_opt_in_source is null) then
    raise exception 'some accounts have no marketing choice recorded';
  end if;

  -- Sign-up with and without the box ticked.
  insert into auth.users (id, email, raw_user_meta_data) values
    (u1, 'mk1-' || u1 || '@trykai.test', '{"full_name":"Ticked","terms_accepted":true,"marketing_opt_in":true}'),
    (u2, 'mk2-' || u2 || '@trykai.test', '{"full_name":"Not ticked","terms_accepted":true}');
  if not (select marketing_opt_in and marketing_opt_in_source = 'signup' from public.users where id = u1) then
    raise exception 'a ticked box should opt in';
  end if;
  if (select marketing_opt_in from public.users where id = u2) then
    raise exception 'an unticked box must not opt in';
  end if;

  -- Settings, as the user.
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  if public.my_marketing_opt_in() then raise exception 'u2 should read false'; end if;
  perform public.set_marketing_opt_in(true);
  if not public.my_marketing_opt_in() then raise exception 'u2 should read true after opting in'; end if;
  if (select marketing_opt_in_source from public.users where id = u2) <> 'settings' then
    raise exception 'settings change should be recorded';
  end if;

  -- One-tap unsubscribe by token; an unknown token does nothing.
  select marketing_token into v_token from public.users where id = u1;
  select public.unsubscribe_marketing(v_token) into v_ok;
  if not v_ok or (select marketing_opt_in from public.users where id = u1) then
    raise exception 'unsubscribe should turn marketing off';
  end if;
  if public.unsubscribe_marketing(gen_random_uuid()) then
    raise exception 'an unknown token should return false';
  end if;

  -- Grants.
  if has_column_privilege('authenticated', 'public.users', 'marketing_token', 'select')
     or has_column_privilege('anon', 'public.users', 'marketing_token', 'select')
     or has_column_privilege('authenticated', 'public.users', 'marketing_opt_in', 'update') then
    raise exception 'clients can reach marketing columns directly';
  end if;
  if not has_function_privilege('anon', 'public.unsubscribe_marketing(uuid)', 'execute') then
    raise exception 'unsubscribe must work without signing in';
  end if;
  if has_function_privilege('anon', 'public.set_marketing_opt_in(boolean)', 'execute') then
    raise exception 'anon must not change consent';
  end if;

  raise notice 'marketing consent check passed';
end $$;

rollback;
