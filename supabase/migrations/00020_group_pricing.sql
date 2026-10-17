-- Hosts can turn automatic group discounts off per listing.
-- Default is on. Existing rows get true.
--
-- Safe to run more than once.

alter table public.listings
  add column if not exists group_pricing boolean not null default true;
