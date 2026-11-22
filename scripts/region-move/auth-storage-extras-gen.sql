-- Read only, run on OLD with psql -At -o post-restore-extras.sql.
-- OPERATIONS.md, Supabase region move (step 3.6).
--
-- Prints SQL that recreates, on NEW, what `supabase db dump` leaves out
-- because it lives in Supabase-managed schemas: the triggers on auth.users
-- (on_auth_user_created, which makes the profile row at sign-up) and the
-- policies on storage.objects (who may upload where). Do not re-run the
-- migrations instead: 00004 would also replace handle_new_user with its
-- first version and undo later changes to it (00054).
-- Output is policy expressions and trigger definitions: no secrets, no data.
select '-- auth.users triggers' as stmt
union all
select format('drop trigger if exists %I on auth.users;', t.tgname)
from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
union all
-- pg_get_triggerdef leaves the function unqualified when it is on the search
-- path; qualify it so the output does not depend on the session's path.
select regexp_replace(pg_get_triggerdef(t.oid), 'EXECUTE FUNCTION (?!public\.)', 'EXECUTE FUNCTION public.') || ';'
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal and p.pronamespace = 'public'::regnamespace
union all
select pg_get_triggerdef(t.oid) || ';'
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal and p.pronamespace <> 'public'::regnamespace
union all
select '-- storage.objects policies'
union all
select format('drop policy if exists %I on storage.objects;', policyname)
from pg_policies where schemaname = 'storage' and tablename = 'objects'
union all
select format('create policy %I on storage.objects as %s for %s to %s%s%s;',
  policyname, permissive, cmd,
  (select string_agg(quote_ident(r), ', ') from unnest(roles) as r),
  coalesce(' using (' || qual || ')', ''),
  coalesce(' with check (' || with_check || ')', ''))
from pg_policies where schemaname = 'storage' and tablename = 'objects';
