-- Point stored URLs at the new project after a region move.
-- OPERATIONS.md, Supabase region move (step 3.9).
--
-- Profile photos, banners and listing photos are saved as full public URLs
-- (https://<ref>.supabase.co/storage/v1/object/public/...), so after the
-- restore they still load from the old project, and break once it is gone.
-- This replaces "https://<old ref>.supabase.co/" with the new ref in every
-- text, varchar, json, jsonb and text[] column of every public table.
--
-- Run with psql against NEW. Inputs come from the environment:
--   OLD_REF, NEW_REF   the two project refs
--   APPLY=yes          to write; anything else (or unset) only reports
-- Run it without APPLY first (lists each column and its row count), then with
-- APPLY=yes, then without again: it must report 0.
--
-- Triggers are off for the update so updated_at stamps, review-status resets
-- and column guards do not fire. Supabase lets postgres turn them off only
-- with a plain top-level SET, not set_config() inside a function, hence the
-- SET below. Safe to run more than once.

\set ON_ERROR_STOP on
\getenv old_ref OLD_REF
\getenv new_ref NEW_REF
\getenv apply_mode APPLY
\if :{?old_ref}
\else
  \echo 'Set OLD_REF first.'
  \quit
\endif
\if :{?new_ref}
\else
  \echo 'Set NEW_REF first.'
  \quit
\endif
\if :{?apply_mode}
\else
  \set apply_mode no
\endif

SET session_replication_role = replica;

select set_config('region_move.old_ref', :'old_ref', false),
  set_config('region_move.new_ref', :'new_ref', false),
  set_config('region_move.apply', :'apply_mode', false);

do $$
declare
  old_ref constant text := current_setting('region_move.old_ref');
  new_ref constant text := current_setting('region_move.new_ref');
  apply constant boolean := current_setting('region_move.apply') = 'yes';
  old_host text := 'https://' || old_ref || '.supabase.co/';
  new_host text := 'https://' || new_ref || '.supabase.co/';
  col record;
  hits bigint;
  total bigint := 0;
  auth_hits bigint;
begin
  if old_ref !~ '^[a-z]{20}$' or new_ref !~ '^[a-z]{20}$' or new_ref = old_ref then
    raise exception 'OLD_REF and NEW_REF must be two different project refs (20 lowercase letters).';
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
