-- Point stored URLs at the new project after the Singapore restore.
-- OPERATIONS.md, Move production to Singapore.
--
-- Profile photos, banners and listing photos are saved as full public URLs
-- (https://<ref>.supabase.co/storage/v1/object/public/...), so after the
-- restore they still load from the old project, and break once it is gone.
-- This replaces "https://<old ref>.supabase.co/" with the new ref in every
-- text, varchar, json, jsonb and text[] column of every public table.
--
-- Run in the SQL Editor of the NEW project (check the ref in the URL).
--   1. Set new_ref below. Leave apply = false and run: the Messages tab lists
--      each column and how many rows it would change. Nothing is written.
--   2. Set apply = true and run again. Same list, now changed.
--   3. Run once more with apply = false: it should report 0 rows.
-- Triggers are skipped for the update (session_replication_role = replica),
-- so updated_at stamps, review-status resets and column guards do not fire.
-- Safe to run more than once.

do $$
declare
  old_ref constant text := 'dqqlwofluvhikebtjune';
  new_ref constant text := 'PASTE_NEW_REF';
  apply constant boolean := false;
  old_host text := 'https://' || old_ref || '.supabase.co/';
  new_host text := 'https://' || new_ref || '.supabase.co/';
  col record;
  hits bigint;
  total bigint := 0;
  auth_hits bigint;
begin
  if new_ref !~ '^[a-z]{20}$' or new_ref = old_ref then
    raise exception 'Set new_ref to the new project ref (20 lowercase letters).';
  end if;

  if apply then
    perform set_config('session_replication_role', 'replica', true);
  end if;

  for col in
    select n.nspname as schema_name, c.relname as table_name, a.attname as column_name,
      format_type(a.atttypid, a.atttypmod) as type_name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
      and a.attgenerated = ''
      and a.atttypid in ('text'::regtype, 'varchar'::regtype, 'json'::regtype, 'jsonb'::regtype,
        'text[]'::regtype, 'varchar[]'::regtype)
    order by 2, 3
  loop
    execute format('select count(*) from %I.%I where strpos(%I::text, %L) > 0',
      col.schema_name, col.table_name, col.column_name, old_host)
      into hits;
    continue when hits = 0;
    total := total + hits;
    raise notice '%.%: % rows', col.table_name, col.column_name, hits;
    if apply then
      execute format('update %I.%I set %I = replace(%I::text, %L, %L)::%s where strpos(%I::text, %L) > 0',
        col.schema_name, col.table_name, col.column_name, col.column_name, old_host, new_host,
        col.type_name, col.column_name, old_host);
    end if;
  end loop;

  -- Not rewritten (Supabase Auth owns this table); reported so nothing is missed.
  select count(*) into auth_hits
  from auth.users
  where strpos(coalesce(raw_user_meta_data::text, '') || coalesce(raw_app_meta_data::text, ''), old_host) > 0;
  if auth_hits > 0 then
    raise notice 'auth.users metadata: % rows name the old project (left as is; the app does not read it for photos)', auth_hits;
  end if;

  raise notice '% % values in all (rows per column, summed).', case when apply then 'Changed' else 'Would change' end, total;
end $$;
