-- Lock storage listing and verification policies.
-- listing-photos was created in the Dashboard: public URLs work, but a broad
-- SELECT lets any client list every host folder. Public object URLs do not
-- need SELECT. Owners still upload / replace / delete in their own
-- auth.uid() folder. The client never list()s or download()s this bucket.
--
-- verification-docs is already private in 00007 (INSERT + UPDATE own folder).
-- This drops leftover Dashboard policies and recreates the writes. Official
-- Storage docs: upsert (overwrite) needs SELECT and UPDATE in addition to
-- INSERT, so hosts get SELECT on their own folder only — required for
-- VerifyIdentity resubmit. They cannot list or read anyone else's files.
-- Admins read via service-role signed URLs. purge-verification-docs deletes
-- with the service role. No client DELETE.
--
-- Delete does not need SELECT when the path is known: storage-js remove()
-- DELETEs by path. list() and download() need SELECT.
--
-- Do not apply until reviewed. Safe to run more than once.

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do update set public = false;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ~ 'listing-photos'
        or coalesce(with_check, '') ~ 'listing-photos'
        or policyname ilike '%listing-photos%'
        or policyname ilike '%listing_photos%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;

  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ~ 'verification-docs'
        or coalesce(with_check, '') ~ 'verification-docs'
        or policyname ilike '%verification%doc%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy listing_photos_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy listing_photos_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy listing_photos_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy verification_docs_select_own_folder on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy verification_docs_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy verification_docs_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
