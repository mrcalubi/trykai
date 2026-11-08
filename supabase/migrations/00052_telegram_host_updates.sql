-- Telegram host updates (DECISIONS.md, 7 November 2026).
--
-- A host connects Telegram once: Settings calls the telegram-link Edge
-- Function, which stores a one-time code here and returns a t.me deep link.
-- Pressing Start sends "/start <code>" to the telegram-webhook Edge Function,
-- which saves the chat id on the user. After that, host emails (new booking,
-- cancellation, moved booking, session reminder, review prompts, "a guest
-- reviewed you") are also sent on Telegram. Email stays the record; Telegram
-- is a backup that never changes the outcome of an action.
--
-- Additive. Apply on staging, then production, before merging the release.
-- Safe to run more than once.

-- users has no table-level SELECT or UPDATE for clients (00023: column
-- grants only), so these two columns are server-only without further grants.
alter table public.users
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_linked_at timestamptz;

comment on column public.users.telegram_chat_id is
  'Telegram chat for host updates. Set by telegram-webhook, cleared on disconnect or when Telegram reports the bot was blocked. Server only.';

create table if not exists public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  constraint telegram_link_codes_code_shape check (code ~ '^[A-Za-z0-9_-]{16,64}$')
);

create index if not exists telegram_link_codes_user_id_idx on public.telegram_link_codes (user_id);

alter table public.telegram_link_codes enable row level security;
revoke all on table public.telegram_link_codes from public, anon, authenticated;
grant select, insert, delete on table public.telegram_link_codes to service_role;

-- The signed-in user's own status for Settings. Never returns the chat id.
create or replace function public.my_telegram()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.telegram_chat_id is not null from public.users u where u.id = auth.uid()), false);
$$;

revoke all on function public.my_telegram() from public, anon;
grant execute on function public.my_telegram() to authenticated;
