-- Read only, run on OLD with psql -At -o grants-sync.sql; then run that file
-- on NEW in one transaction. OPERATIONS.md, Supabase region move (step 3.7).
--
-- Why: a new Supabase project hands anon and authenticated access to every
-- function (and sequence) it creates, a default separate from the "auto-grant
-- tables" checkbox. pg_dump re-adds OLD's grants but never revokes, so after
-- the restore NEW is far more open than OLD (on 20 Nov 2026: 483 table grants
-- against 165, functions 285 against 207, admin functions included).
--
-- Prints SQL that makes NEW's privileges for anon,
-- authenticated, service_role and PUBLIC on every object in schema public
-- exactly equal to OLD's: revoke everything those four have, then grant back
-- what OLD has. The owner (postgres) is never touched. A NULL ACL means the
-- Postgres default (functions: EXECUTE to PUBLIC), so it is expanded with
-- acldefault() rather than read as "no grants".
with rel as (
  select c.oid, c.relkind, c.relowner, c.relacl,
    format('%I.%I', n.nspname, c.relname) as name,
    case c.relkind when 'S' then 'sequence' else 'table' end as kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
),
col as (
  select r.name, a.attname, a.attacl
  from rel r
  join pg_attribute a on a.attrelid = r.oid
  where r.relkind in ('r', 'p', 'v', 'm', 'f') and a.attnum > 0 and not a.attisdropped
),
fn as (
  select p.oid, p.proowner, p.proacl, p.prokind,
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
roles(rolname) as (values ('anon'), ('authenticated'), ('service_role')),
stmts as (
  -- 1. revoke, tables and sequences
  select 1 as step, name as obj, format('revoke all on %s %s from public, anon, authenticated, service_role;', kind, name) as stmt
  from rel
  union all
  -- 2. revoke, column-level grants
  select 2, name || '.' || attname, format('revoke all (%I) on table %s from public, anon, authenticated, service_role;', attname, name)
  from col
  union all
  -- 3. revoke, functions and procedures
  select 3, name, format('revoke all on %s %s from public, anon, authenticated, service_role;',
    case prokind when 'p' then 'procedure' else 'function' end, name)
  from fn
  union all
  -- 4. grant back, tables and sequences
  select 4, r.name, format('grant %s on %s %s to %s%s;', a.privilege_type, r.kind, r.name,
    case when a.grantee = 0 then 'public' else quote_ident(g.rolname) end,
    case when a.is_grantable then ' with grant option' else '' end)
  from rel r
  cross join lateral aclexplode(coalesce(r.relacl, acldefault((case r.relkind when 'S' then 's' else 'r' end)::"char", r.relowner))) a
  left join pg_roles g on g.oid = a.grantee
  where a.grantee = 0 or g.rolname in (select rolname from roles)
  union all
  -- 5. grant back, column-level
  select 5, c.name || '.' || c.attname, format('grant %s (%I) on table %s to %s%s;', a.privilege_type, c.attname, c.name,
    case when a.grantee = 0 then 'public' else quote_ident(g.rolname) end,
    case when a.is_grantable then ' with grant option' else '' end)
  from col c
  cross join lateral aclexplode(c.attacl) a
  left join pg_roles g on g.oid = a.grantee
  where c.attacl is not null and (a.grantee = 0 or g.rolname in (select rolname from roles))
  union all
  -- 6. grant back, functions and procedures
  select 6, f.name, format('grant %s on %s %s to %s%s;', a.privilege_type,
    case f.prokind when 'p' then 'procedure' else 'function' end, f.name,
    case when a.grantee = 0 then 'public' else quote_ident(g.rolname) end,
    case when a.is_grantable then ' with grant option' else '' end)
  from fn f
  cross join lateral aclexplode(coalesce(f.proacl, acldefault('f'::"char", f.proowner))) a
  left join pg_roles g on g.oid = a.grantee
  where a.grantee = 0 or g.rolname in (select rolname from roles)
)
select stmt from stmts order by step, obj, stmt;
