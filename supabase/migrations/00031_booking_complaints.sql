-- In-app quality complaints (report-booking-problem, DECISIONS.md 19 October).
--
-- Numbered 00031 because 00030 is taken by the booking_money_events branch.
--
-- A guest reports a problem from their booking page within 3 days after the
-- session ends (Dispute Policy). The Edge Function checks the window, writes
-- this row and the photos with the service role, and places the payout hold
-- (bookings.payout_hold_reason = 'dispute', 00029). One complaint per
-- booking; later detail goes in the email thread.
--
-- Clients never INSERT, UPDATE, or DELETE. The guest can SELECT their own
-- row's id, booking_id, and created_at so the booking page can say "You
-- reported a problem on ...". The description and photo paths are not
-- client-readable, and the host has no access at all.
--
-- Photos live in the private `complaint-evidence` bucket at
-- {booking_id}/{complaint_id}/{n}.{ext}. There are no storage policies on it,
-- so only the service role reads or writes. Ops open them from the Supabase
-- Storage dashboard. purge-verification-docs deletes them 180 days after the
-- complaint and sets photos_purged_at; the description stays as the record.
--
-- Safe to run more than once.

create table if not exists public.booking_complaints (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  guest_id uuid not null references public.users(id) on delete cascade,
  description text not null check (char_length(description) between 20 and 2000),
  photo_paths text[] not null default '{}',
  photos_purged_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists booking_complaints_booking_id_key
  on public.booking_complaints (booking_id);

create index if not exists booking_complaints_created_at_idx
  on public.booking_complaints (created_at);

alter table public.booking_complaints enable row level security;

revoke all on table public.booking_complaints from public, anon, authenticated;
grant all on table public.booking_complaints to service_role;

grant select (id, booking_id, created_at) on table public.booking_complaints to authenticated;

drop policy if exists booking_complaints_select_own on public.booking_complaints;
create policy booking_complaints_select_own on public.booking_complaints
  for select to authenticated
  using (guest_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('complaint-evidence', 'complaint-evidence', false)
on conflict (id) do update set public = false;
