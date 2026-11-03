-- Lock the reviews table so clients cannot SELECT everyone else's rows or
-- INSERT directly. All writes go through post_review (00048).
--
-- Apply this file ONLY after the two-way-reviews release is live on
-- production. Apply on staging first, test, then production. If this runs
-- before the client that calls post_review / host_rating / reviews_for_*
-- with reviewer_id, listing pages and guest review submit will break.
--
-- Safe to run more than once.

drop policy if exists "Anyone can view reviews" on public.reviews;
drop policy if exists "Guests can leave reviews" on public.reviews;

revoke select, insert on table public.reviews from anon;
revoke insert on table public.reviews from authenticated;

drop policy if exists "Reviewers can read their own reviews" on public.reviews;
create policy "Reviewers can read their own reviews" on public.reviews
  for select
  to authenticated
  using (reviewer_id = auth.uid());
