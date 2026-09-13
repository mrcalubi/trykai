-- Listing/session INSERT policies from 00007 subquery public.users for
-- verification_status and is_suspended. RLS expressions run as the caller.
-- 00005 revoked ALL on users and never re-granted is_suspended, so an
-- approved host's INSERT dies with "permission denied for table users"
-- rather than a policy miss. Same family as the 00003 signup/verification
-- grant holes.
--
-- Do not GRANT SELECT (is_suspended): "Anyone can view host profiles"
-- USING (true) would then expose suspension to every client. Follow
-- my_verification(): a security-definer function that only reads
-- auth.uid(), and keep the ownership checks in the policies.
--
-- Safe to run more than once. Staging may already have this from ad hoc SQL.

create or replace function public.can_create_listing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and verification_status = 'approved'
      and not is_suspended
  );
$$;

revoke all on function public.can_create_listing() from public, anon;
grant execute on function public.can_create_listing() to authenticated;

drop policy if exists hosts_create_listings_verified on public.listings;

create policy hosts_create_listings_verified on public.listings
  for insert to authenticated
  with check (
    auth.uid() = host_id
    and public.can_create_listing()
  );

drop policy if exists hosts_create_sessions_verified on public.sessions;

create policy hosts_create_sessions_verified on public.sessions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.listings
      where listings.id = sessions.listing_id
        and listings.host_id = auth.uid()
    )
    and public.can_create_listing()
  );
