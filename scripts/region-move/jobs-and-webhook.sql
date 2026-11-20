-- Run with psql against NEW after the restore and the grants sync.
-- OPERATIONS.md, Supabase region move (step 3.8).
--
-- Recreates what the dump does not carry, as production had it in Nov 2026:
--   Vault: the three send-reminders secrets (release_payout_* were never set,
--          so invoke_release_payout() is a no-op, as before)
--   cron:  four jobs. Two come from migrations (00010, 00037); two were made
--          in the dashboard and call functions directly with x-cron-secret.
--   one database webhook on users (notify-verification-pending). The old
--          notify-verification-result webhook is dropped: its function is gone.
-- Check OLD first (cron.job, vault.secrets names, supabase_functions.hooks
-- triggers) in case that has changed since.
--
-- Inputs, from the environment, never typed into this file:
--   NEW_REF                 the new project ref
--   NEW_ANON_KEY            NEW legacy anon key (eyJ...)
--   REMINDERS_CRON_SECRET   value of REMINDERS_CRON_SECRET on NEW
--   NEW_PURGE_SECRET        value of VERIFICATION_PURGE_SECRET on NEW
--   NEW_PAYOUT_SECRET       value of PAYOUT_CRON_SECRET on NEW
-- psql does not substitute variables inside $...$ quotes, so the cron
-- commands are built with format() and the values passed in as literals.

\set ON_ERROR_STOP on
\getenv new_ref NEW_REF
\getenv anon_key NEW_ANON_KEY
\getenv reminders_secret REMINDERS_CRON_SECRET
\getenv purge_secret NEW_PURGE_SECRET
\getenv payout_secret NEW_PAYOUT_SECRET
\if :{?new_ref}
\else
  \echo 'Set NEW_REF first.'
  \quit
\endif
\if :{?anon_key}
\else
  \echo 'Set NEW_ANON_KEY first.'
  \quit
\endif
\if :{?reminders_secret}
\else
  \echo 'Set REMINDERS_CRON_SECRET first.'
  \quit
\endif
\if :{?purge_secret}
\else
  \echo 'Set NEW_PURGE_SECRET first.'
  \quit
\endif
\if :{?payout_secret}
\else
  \echo 'Set NEW_PAYOUT_SECRET first.'
  \quit
\endif
\set base 'https://' :new_ref '.supabase.co/functions/v1/'
\set reminders_url :base 'send-reminders'
\set purge_url :base 'purge-verification-docs'
\set payout_url :base 'release-payout'
\set webhook_url :base 'notify-verification-pending'

-- Stop here if any value is missing or looks wrong (prints no values).
select case
  when :'new_ref' !~ '^[a-z]{20}$' then 1 / 0
  when :'anon_key' not like 'eyJ%' then 1 / 0
  when length(:'reminders_secret') < 16 then 1 / 0
  when length(:'purge_secret') < 32 then 1 / 0
  when length(:'payout_secret') < 32 then 1 / 0
  else 1 end as values_look_right;

begin;

-- 1. Vault. Copies from a restore cannot be decrypted here, so start clean.
delete from vault.secrets where name in (
  'send_reminders_url', 'send_reminders_anon_key', 'reminders_cron_secret',
  'release_payout_url', 'release_payout_anon_key', 'payout_cron_secret');

select vault.create_secret(:'reminders_url',
  'send_reminders_url', 'Hourly session reminder job') is not null as vault_url;
select vault.create_secret(:'anon_key',
  'send_reminders_anon_key', 'Gateway JWT; the function still checks x-cron-secret') is not null as vault_anon;
select vault.create_secret(:'reminders_secret',
  'reminders_cron_secret', 'x-cron-secret for send-reminders') is not null as vault_secret;

-- 2. Cron. Remove anything already there, then the same four jobs.
select count(cron.unschedule(jobid)) as removed_jobs from cron.job;

select cron.schedule('invoke-release-payout-hourly', '12 * * * *',
  'select public.invoke_release_payout()') > 0 as job_1;

select cron.schedule('invoke-send-reminders-hourly', '17 * * * *',
  'select public.invoke_send_reminders()') > 0 as job_2;

select cron.schedule('purge-verification-docs-daily', '0 16 * * *', format(
  'select net.http_post(url := %L, headers := %L::jsonb, timeout_milliseconds := 1000)',
  :'purge_url',
  jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', :'purge_secret')::text
)) > 0 as job_3;

select cron.schedule('release-payout-hourly', '0 * * * *', format(
  'select net.http_post(url := %L, headers := %L::jsonb, timeout_milliseconds := 1000)',
  :'payout_url',
  jsonb_build_object('x-cron-secret', :'payout_secret')::text
)) > 0 as job_4;

-- 3. Database webhook on users, pointed at NEW.
drop trigger if exists "notify-verification-pending" on public.users;
drop trigger if exists "notify-verification-result" on public.users;
create trigger "notify-verification-pending"
  after update on public.users
  for each row execute function supabase_functions.http_request(
    :'webhook_url', 'POST', '{"Content-type":"application/json"}', '{}', '5000');

commit;

-- 4. Check: four jobs, three Vault names, one webhook, nothing naming another
-- project. No secrets shown.
select 'cron' as kind, jobname as name,
  schedule || case when command ~ 'https://[a-z]{20}\.supabase\.co' and command !~ :'new_ref'
    then '  OTHER PROJECT!' else '' end as detail
from cron.job
union all
select 'vault', name, 'present' from vault.secrets
union all
select 'webhook', t.tgname,
  'on ' || c.relname || case when pg_get_triggerdef(t.oid) !~ :'new_ref' then '  OTHER PROJECT!' else '' end
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where p.proname = 'http_request'
order by 1, 2;
