-- First-touch marketing source on each booking (ANALYTICS_AND_AI_SEARCH.md,
-- 26 November 2026).
--
-- The browser remembers the utm_source / utm_medium / utm_campaign of a
-- visitor's first tagged visit (or the referring site when the link was not
-- tagged) and create-payment-intent copies it onto the booking. That lets the
-- Saturday numbers count bookings per channel, not just visits.
--
-- Values are cleaned by _shared/attribution.ts before insert: lower case,
-- letters, digits and _ - . + ~ only, at most 100 characters. The checks below
-- hold the same line if anything else ever writes here.
--
-- Nullable: a booking with no known source (typed the address, or arrived
-- before this shipped) stays null and counts as "direct".
--
-- No grant changes. Clients already SELECT bookings under RLS (00009), so the
-- guest and the host of a booking can read its source; neither can write it.
-- Safe to run more than once.

alter table public.bookings
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_utm_tags_check'
  ) then
    alter table public.bookings
      add constraint bookings_utm_tags_check check (
        (utm_source is null or utm_source ~ '^[a-z0-9_.+~-]{1,100}$')
        and (utm_medium is null or utm_medium ~ '^[a-z0-9_.+~-]{1,100}$')
        and (utm_campaign is null or utm_campaign ~ '^[a-z0-9_.+~-]{1,100}$')
      );
  end if;
end
$$;

comment on column public.bookings.utm_source is
  'First-touch utm_source (or referring host) of the guest who booked; null = direct/unknown.';
comment on column public.bookings.utm_medium is
  'First-touch utm_medium, e.g. bio, story, referral.';
comment on column public.bookings.utm_campaign is
  'First-touch utm_campaign, e.g. dayone.';
