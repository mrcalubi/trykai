-- Session reminder emails. An hourly pg_cron job calls send-reminders for
-- confirmed bookings and their hosts when the session starts in 2–24 hours.
-- The two timestamps are the claim: the function writes them where null
-- (RETURNING) before it sends, so two overlapping runs cannot double-send.
--
-- After this migration, still required once per project (SQL editor):
--   vault secrets send_reminders_url, send_reminders_anon_key, reminders_cron_secret
-- Exact statements: OPERATIONS.md, Session reminders.
-- Apply this file on the project before merging the send-reminders function,
-- so the hourly job does not query columns that are not there yet.
--
-- Safe to run more than once.

alter table public.bookings
  add column if not exists guest_reminder_sent_at timestamptz;

alter table public.sessions
  add column if not exists host_reminder_sent_at timestamptz;

comment on column public.bookings.guest_reminder_sent_at is
  'Set by send-reminders when the guest reminder is claimed. Not granted to clients.';

comment on column public.sessions.host_reminder_sent_at is
  'Set by send-reminders when the host reminder is claimed. Not granted to clients.';

-- 00009 grants table SELECT on bookings (authenticated) and sessions
-- (anon and authenticated). New columns inherit that. Clients have no
-- use for the claim timestamps, and must not write them.
revoke select (guest_reminder_sent_at) on table public.bookings
  from public, anon, authenticated;
revoke update (guest_reminder_sent_at) on table public.bookings
  from public, anon, authenticated;

revoke select (host_reminder_sent_at) on table public.sessions
  from public, anon, authenticated;
revoke insert (host_reminder_sent_at) on table public.sessions
  from public, anon, authenticated;
revoke update (host_reminder_sent_at) on table public.sessions
  from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_net;
exception
  when others then
    raise notice 'could not create pg_net: %', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_cron;
exception
  when others then
    raise notice 'could not create pg_cron: %', sqlerrm;
end $$;

create or replace function public.invoke_send_reminders()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id bigint;
  reminders_url text;
  reminders_secret text;
  reminders_apikey text;
begin
  begin
    select decrypted_secret into reminders_url
    from vault.decrypted_secrets
    where name = 'send_reminders_url';

    select decrypted_secret into reminders_secret
    from vault.decrypted_secrets
    where name = 'reminders_cron_secret';

    select decrypted_secret into reminders_apikey
    from vault.decrypted_secrets
    where name = 'send_reminders_anon_key';
  exception
    when undefined_table then
      raise warning 'vault.decrypted_secrets is not available; skip send-reminders';
      return null;
    when invalid_schema_name then
      raise warning 'vault schema is not available; skip send-reminders';
      return null;
  end;

  if reminders_url is null or reminders_secret is null or reminders_apikey is null then
    raise warning 'send-reminders vault secrets are not set (send_reminders_url, send_reminders_anon_key, reminders_cron_secret)';
    return null;
  end if;

  begin
    select net.http_post(
      url := reminders_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || reminders_apikey,
        'apikey', reminders_apikey,
        'x-cron-secret', reminders_secret
      ),
      body := '{}'::jsonb
    ) into request_id;
  exception
    when undefined_function then
      raise warning 'pg_net is not available; skip send-reminders';
      return null;
    when invalid_schema_name then
      raise warning 'pg_net schema is not available; skip send-reminders';
      return null;
  end;

  return request_id;
end;
$$;

revoke all on function public.invoke_send_reminders() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('invoke-send-reminders-hourly');
exception
  when others then
    null;
end $$;

do $$
begin
  perform cron.schedule(
    'invoke-send-reminders-hourly',
    '17 * * * *',
    $job$select public.invoke_send_reminders()$job$
  );
exception
  when others then
    raise notice 'pg_cron not available; invoke-send-reminders-hourly not scheduled: %', sqlerrm;
end $$;
