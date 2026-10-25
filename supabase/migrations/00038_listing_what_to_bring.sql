-- What guests should bring. Optional, same shape as the custom half of
-- what's provided: up to 5 items, each 1–40 characters and already trimmed.
-- Hosts write it on Create and Edit listing; guests read it on the listing
-- page and in the booking confirmation.
--
-- Grants follow 00025: anon and authenticated SELECT the column,
-- authenticated INSERT (table grant) and UPDATE it on Edit listing.
-- guard_listing_review (00036) treats a change here as content, so a
-- changes_requested listing goes back to pending.
--
-- Apply on the project before merging: create/edit and the listing page
-- select this column. Safe to run more than once.

alter table public.listings
  add column if not exists what_to_bring text[];

comment on column public.listings.what_to_bring is
  'Optional items guests should bring. Null or up to 5 trimmed strings of 1–40 characters.';

create or replace function public.listings_what_to_bring_ok(items text[])
returns boolean
language sql
immutable
as $$
  select
    items is null
    or (
      cardinality(items) <= 5
      and not exists (
        select 1
        from unnest(items) as item
        where item is null
           or length(item) < 1
           or length(item) > 40
           or item is distinct from btrim(item)
      )
    );
$$;

-- CHECK constraints run as the caller, not the owner. This function must
-- stay granted: without EXECUTE, every authenticated INSERT or UPDATE on
-- listings fails with permission denied, even when what_to_bring is
-- unchanged (create listing, edit listing, spots, review fields). It is
-- immutable and only checks the array shape.
grant execute on function public.listings_what_to_bring_ok(text[])
  to anon, authenticated, service_role;

alter table public.listings drop constraint if exists listings_what_to_bring_items;
alter table public.listings
  add constraint listings_what_to_bring_items
  check (public.listings_what_to_bring_ok(what_to_bring));

-- 00025 granted listings SELECT/UPDATE by named columns. A new column does
-- not inherit those lists.
grant select (what_to_bring) on table public.listings to anon, authenticated;
grant insert on table public.listings to authenticated;
grant update (
  title,
  description,
  category,
  price_per_person,
  duration_mins,
  group_pricing,
  area,
  full_address,
  whats_provided,
  what_to_bring,
  photo_urls
) on table public.listings to authenticated;

create or replace function public.guard_listing_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.review_status := 'pending';
    new.review_note := null;
    new.review_requested_at := now();
    new.reviewed_at := null;
    new.review_notified_at := null;
    return new;
  end if;

  new.review_status := old.review_status;
  new.review_note := old.review_note;
  new.review_requested_at := old.review_requested_at;
  new.reviewed_at := old.reviewed_at;
  new.review_notified_at := old.review_notified_at;

  -- The host has acted on the reviewer's note: back into the queue.
  if old.review_status = 'changes_requested'
     and (new.title, new.description, new.category, new.price_per_person, new.photo_urls,
          new.whats_provided, new.what_to_bring, new.area, new.duration_mins, new.full_address)
         is distinct from
         (old.title, old.description, old.category, old.price_per_person, old.photo_urls,
          old.whats_provided, old.what_to_bring, old.area, old.duration_mins, old.full_address) then
    new.review_status := 'pending';
    new.review_requested_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists listings_guard_review on public.listings;
create trigger listings_guard_review
  before insert or update on public.listings
  for each row
  execute function public.guard_listing_review();
