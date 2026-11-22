-- Read only, run on OLD with psql after the site is closed and NEW is checked.
-- OPERATIONS.md, Supabase region move (step 3.14).
--
-- Part 1: newest created_at / updated_at per table (public, accounts, files)
-- and whether it is after T0, the moment the site closed. An "AFTER T0" row is
-- a write that may have missed the dump.
-- Part 2: for accounts, whether that was a new sign-up, a sign-in, or another
-- update. Then compare fingerprints with auth-fingerprints.sql.
--
-- Input: T0 in the environment, as an ISO time, e.g. T0=2026-11-19T15:04:48Z
-- Prints table names, times and counts only.

\set ON_ERROR_STOP on
\getenv t0 T0
\if :{?t0}
\else
  \echo 'Set T0 first (e.g. 2026-11-19T15:04:48Z).'
  \quit
\endif

with t as (
  select c.relname as table_name, 'public' as schema_name,
    string_agg(format('%I', a.attname), ', ') as cols
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
    and a.attname in ('created_at', 'updated_at')
  group by c.relname
  union all select 'users', 'auth', 'created_at, updated_at'
  union all select 'objects', 'storage', 'created_at, updated_at'
),
latest as (
  select schema_name || '.' || table_name as table_name,
    (xpath('/row/m/text()', query_to_xml(
      format('select max(greatest(%s)) as m from %I.%I', cols, schema_name, table_name),
      false, true, '')))[1]::text::timestamptz as latest_write
  from t
)
select table_name, latest_write,
  case when latest_write > :'t0'::timestamptz then 'AFTER T0' else '' end as flag
from latest
order by latest_write desc nulls last;

select count(*) as accounts,
  max(created_at) as newest_signup,
  count(*) filter (where created_at > :'t0'::timestamptz) as created_after_t0,
  count(*) filter (where last_sign_in_at > :'t0'::timestamptz) as signed_in_after_t0,
  count(*) filter (where updated_at > :'t0'::timestamptz) as updated_after_t0
from auth.users;
