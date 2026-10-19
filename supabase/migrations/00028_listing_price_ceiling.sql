-- Typo guard on listing price. Staging has seen $7,580 and $137,027 per
-- person because CreateListing only checked price > 0 and the only CHECK
-- was listings_price_nonneg (00003). Hosts can UPDATE price_per_person
-- directly (00024 grant), so the ceiling has to live in the database too.
--
-- S$500 (50000 cents) is far above the S$10 to S$40 guidance band, which
-- stays guidance (DECISIONS.md, 29 September). Keep in step with
-- MAX_PRICE_PER_PERSON_CENTS in src/lib/pricing.js.
--
-- NOT VALID so rows already above the ceiling do not block the migration.
-- They still fail on their next UPDATE. Find them with:
--   select id, title, price_per_person from public.listings
--   where price_per_person > 50000;
--
-- Safe to run more than once.

alter table public.listings drop constraint if exists listings_price_ceiling;

alter table public.listings
  add constraint listings_price_ceiling check (price_per_person <= 50000) not valid;
