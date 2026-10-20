drop schema if exists public cascade; create schema public;
drop schema if exists auth cascade; create schema auth;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.users (id uuid primary key);
create table public.listings (id uuid primary key, host_id uuid references public.users(id), duration_mins int not null default 60, title text);
create table public.sessions (
  id uuid primary key default gen_random_uuid(), listing_id uuid references public.listings(id),
  starts_at timestamptz not null, duration_mins int not null, spots_total int not null default 4,
  spots_remaining int not null default 4, status text default 'open', created_at timestamptz default now());
create table public.bookings (
  id uuid primary key default gen_random_uuid(), session_id uuid references public.sessions(id), guest_id uuid,
  status text not null default 'pending', guests_count int not null default 1, stripe_charge_id text,
  host_fee int, host_payout_amount int, total_amount int default 2800);
