-- Host Connect Transfers only happen when release-payout is invoked.
-- Nothing in the repo used to call it, so Stripe logs never showed tr_ rows
-- even after sessions passed the 24h hold. Schedule the function hourly via
-- pg_cron + pg_net. Vault holds the URL, anon key, and cron secret because
-- those differ per project and must not live in git.
--
-- GitHub Actions also invoke the function (see .github/workflows/release-payout.yml)
-- once that workflow is on the default branch. Both paths are idempotent
-- (Stripe idempotency key = booking id).
--
-- After this migration, still required once per project (SQL editor):
--   vault secrets release_payout_url, release_payout_anon_key, payout_cron_secret
-- Exact statements: OPERATIONS.md.

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

create or replace function public.invoke_release_payout()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id bigint;
  payout_url text;
  payout_secret text;
  payout_apikey text;
begin
  begin
    select decrypted_secret into payout_url
    from vault.decrypted_secrets
    where name = 'release_payout_url';

    select decrypted_secret into payout_secret
    from vault.decrypted_secrets
    where name = 'payout_cron_secret';

    select decrypted_secret into payout_apikey
    from vault.decrypted_secrets
    where name = 'release_payout_anon_key';
  exception
    when undefined_table then
      raise warning 'vault.decrypted_secrets is not available; skip release-payout';
      return null;
    when invalid_schema_name then
      raise warning 'vault schema is not available; skip release-payout';
      return null;
  end;

  if payout_url is null or payout_secret is null or payout_apikey is null then
    raise warning 'release-payout vault secrets are not set (release_payout_url, release_payout_anon_key, payout_cron_secret)';
    return null;
  end if;

  begin
    select net.http_post(
      url := payout_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || payout_apikey,
        'apikey', payout_apikey,
        'x-cron-secret', payout_secret
      ),
      body := '{}'::jsonb
    ) into request_id;
  exception
    when undefined_function then
      raise warning 'pg_net is not available; skip release-payout';
      return null;
    when invalid_schema_name then
      raise warning 'pg_net schema is not available; skip release-payout';
      return null;
  end;

  return request_id;
end;
$$;

revoke all on function public.invoke_release_payout() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('invoke-release-payout-hourly');
exception
  when others then
    null;
end $$;

do $$
begin
  perform cron.schedule(
    'invoke-release-payout-hourly',
    '12 * * * *',
    $job$select public.invoke_release_payout()$job$
  );
exception
  when others then
    raise notice 'pg_cron not available; invoke-release-payout-hourly not scheduled: %', sqlerrm;
end $$;
