-- Telegram host updates check. Run in the SQL Editor after 00052.
--
-- begin … rollback so nothing is kept. "ROLLBACK" with no error means every
-- check passed.

begin;

do $$
declare
  v_user uuid;
  v_ok boolean;
begin
  -- Columns and table exist.
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'users' and column_name = 'telegram_chat_id') then
    raise exception 'users.telegram_chat_id missing';
  end if;
  if to_regclass('public.telegram_link_codes') is null then
    raise exception 'telegram_link_codes missing';
  end if;

  -- Clients cannot read or change the chat id, or see link codes.
  if has_column_privilege('authenticated', 'public.users', 'telegram_chat_id', 'select')
     or has_column_privilege('authenticated', 'public.users', 'telegram_chat_id', 'update')
     or has_column_privilege('anon', 'public.users', 'telegram_chat_id', 'select') then
    raise exception 'clients can reach users.telegram_chat_id';
  end if;
  if has_table_privilege('authenticated', 'public.telegram_link_codes', 'select')
     or has_table_privilege('anon', 'public.telegram_link_codes', 'select')
     or has_table_privilege('authenticated', 'public.telegram_link_codes', 'insert') then
    raise exception 'clients can reach telegram_link_codes';
  end if;
  if not has_table_privilege('service_role', 'public.telegram_link_codes', 'insert') then
    raise exception 'service_role cannot write telegram_link_codes';
  end if;

  -- my_telegram(): signed-in users only.
  if has_function_privilege('anon', 'public.my_telegram()', 'execute') then
    raise exception 'anon can call my_telegram()';
  end if;
  if not has_function_privilege('authenticated', 'public.my_telegram()', 'execute') then
    raise exception 'authenticated cannot call my_telegram()';
  end if;

  -- Codes must look like the ones telegram-link makes.
  select id into v_user from public.users limit 1;
  if v_user is not null then
    begin
      insert into public.telegram_link_codes (code, user_id) values ('short', v_user);
      raise exception 'a malformed code was accepted';
    exception when check_violation then
      null;
    end;
    insert into public.telegram_link_codes (code, user_id) values ('abcDEF123_-xyz7890', v_user);
    if (select expires_at - created_at from public.telegram_link_codes where code = 'abcDEF123_-xyz7890') <> interval '30 minutes' then
      raise exception 'codes should last 30 minutes';
    end if;

    -- my_telegram() follows the chat id for the signed-in user.
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    update public.users set telegram_chat_id = null where id = v_user;
    select public.my_telegram() into v_ok;
    if v_ok then raise exception 'my_telegram() true without a chat'; end if;
    update public.users set telegram_chat_id = 123456 where id = v_user;
    select public.my_telegram() into v_ok;
    if not v_ok then raise exception 'my_telegram() false with a chat'; end if;
  end if;

  raise notice 'telegram check passed';
end $$;

rollback;
