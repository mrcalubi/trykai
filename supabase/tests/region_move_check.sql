-- Region move check (read only). OPERATIONS.md, Move production to Singapore.
--
-- Run in the SQL Editor on the OLD project, then on the NEW one, right after
-- the restore. Download each result as CSV and compare them (any diff tool,
-- or paste both into a sheet). Every row should match except:
--   extension     versions can be newer on the new project
--   webhook, ref  must name the NEW ref on the new project (no row is best)
--   vault         names only; values are never shown and must be set again
-- Nothing here prints a secret or personal data: counts, names and md5s.

select * from (
  -- Row counts: public tables, accounts, storage metadata, migration history.
  select 'rows' as section,
    n.nspname || '.' || c.relname as item,
    (xpath('/row/c/text()', query_to_xml(
      format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text as value
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and not c.relispartition
    and (n.nspname = 'public'
      or (n.nspname, c.relname) in (('auth', 'users'), ('auth', 'identities'),
        ('storage', 'buckets'), ('storage', 'objects'),
        ('supabase_migrations', 'schema_migrations')))

  union all
  -- Files per bucket, from the restored metadata. copy-storage.mjs prints the same.
  select 'bucket', bucket_id, count(*) || ' files, ' || coalesce(sum((metadata->>'size')::bigint), 0) || ' bytes'
  from storage.objects
  group by bucket_id

  union all
  select 'bucket settings', id, 'public=' || public || ' limit=' || coalesce(file_size_limit::text, '-')
    || ' types=' || coalesce(array_to_string(allowed_mime_types, ','), '-')
  from storage.buckets

  union all
  -- The data dump sets sequences; a lower value here means new ids would collide.
  select 'sequence', schemaname || '.' || sequencename, coalesce(last_value::text, 'unused')
  from pg_sequences
  where schemaname = 'public'

  union all
  -- handle_new_user (00004). Not in a schema dump if Supabase skips the auth schema.
  select 'auth trigger', t.tgname, p.proname
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal

  union all
  select 'triggers', 'public', count(*) || ' ' || md5(coalesce(string_agg(pg_get_triggerdef(t.oid), E'\n'
    order by c.relname, t.tgname), ''))
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal

  union all
  select 'policies', schemaname || '.' || tablename, count(*) || ' ' || md5(string_agg(
    policyname || cmd || array_to_string(roles, ',') || coalesce(qual, '') || coalesce(with_check, ''), E'\n'
    order by policyname))
  from pg_policies
  where schemaname in ('public', 'storage')
  group by schemaname, tablename

  union all
  select 'rls', n.nspname || '.' || c.relname, 'enabled=' || c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')

  union all
  select 'functions', 'public', count(*) || ' ' || md5(coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'
    order by p.proname, pg_get_function_identity_arguments(p.oid)), ''))
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')

  union all
  select 'grants', 'public tables', count(*) || ' ' || md5(coalesce(string_agg(
    grantee || table_name || privilege_type, ',' order by grantee, table_name, privilege_type), ''))
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role', 'public')

  union all
  select 'grants', 'public columns', count(*) || ' ' || md5(coalesce(string_agg(
    grantee || table_name || column_name || privilege_type, ',' order by grantee, table_name, column_name, privilege_type), ''))
  from information_schema.column_privileges
  where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role', 'public')

  union all
  select 'grants', 'public functions', count(*) || ' ' || md5(coalesce(string_agg(
    grantee || routine_name || privilege_type, ',' order by grantee, routine_name, privilege_type), ''))
  from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role', 'public')

  union all
  select 'extension', extname, extversion
  from pg_extension

  union all
  -- Hourly payout and reminders (00010, 00037) plus any job made in the dashboard.
  -- The command is shown as an md5 because a dashboard job can carry a key.
  select 'cron job', (xpath('/row/n/text()', r))[1]::text, (xpath('/row/v/text()', r))[1]::text
  from unnest(xpath('/table/row', case when to_regclass('cron.job') is not null
    then query_to_xml($q$select coalesce(jobname, 'job ' || jobid) as n,
      schedule || ' active=' || active || ' cmd=' || md5(command) as v from cron.job$q$, false, false, '')
    else '<table/>'::xml end)) as r

  union all
  select 'vault', (xpath('/row/n/text()', r))[1]::text, 'present'
  from unnest(xpath('/table/row', case when to_regclass('vault.secrets') is not null
    then query_to_xml('select name as n from vault.secrets where name is not null', false, false, '')
    else '<table/>'::xml end)) as r

  union all
  -- Database webhooks call a fixed URL. After the restore they still name the old ref.
  select 'webhook', c.relname || '.' || t.tgname,
    coalesce(substring(pg_get_triggerdef(t.oid) from 'https://[a-z0-9]+\.supabase\.co'), 'other URL')
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
  join pg_class c on c.oid = t.tgrelid
  where pn.nspname = 'supabase_functions' and p.proname = 'http_request'

  union all
  -- Any function body that names a project URL.
  select 'ref', n.nspname || '.' || p.proname,
    substring(p.prosrc from 'https://[a-z0-9]+\.supabase\.co')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'auth', 'storage')
    and p.prosrc ~ 'https://[a-z0-9]+\.supabase\.co'
) as fingerprint
order by section, item;
