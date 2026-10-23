-- Hosts can verify with Singpass Myinfo (DECISIONS.md, 23 October). Scopes
-- are name, date of birth and mobile number: TryKai receives those and
-- Singpass's own identifier for the person (`sub`, a UUID), never an NRIC
-- number, and stores no documents on this route.
--
--   * users.singpass_sub: unique, so one Singpass can back only one TryKai
--     host account. users.verified_name, verified_dob, verified_mobile: what
--     Singpass returned. None is readable or writable by any client role.
--   * singpass_auth_sessions: one row per attempt, holding the state, nonce,
--     PKCE verifier and the attempt's ephemeral DPoP key between
--     singpass-start and singpass-callback, then the retrieved details while
--     the host reviews them (Myinfo shows them back read-only before
--     submitting). Service role only; deleted on confirm or cancel and swept
--     after 30 minutes, so unsubmitted Myinfo data does not linger.
--   * record_singpass_verification: service role only. Refuses anyone under
--     18 on a full date of birth, and a Singpass already linked elsewhere.
--     Moves the host to pending with method 'singpass', so the reviewer still
--     reads what they want to teach before approving.
--   * 'singpass' joins the allowed verification methods, and
--     review_verification accepts it so an approval keeps the method.
--
-- Safe to run more than once, including over the earlier name-only draft.

alter table public.users
  add column if not exists singpass_sub text,
  add column if not exists verified_name text,
  add column if not exists verified_dob text,
  add column if not exists verified_mobile text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_verified_dob_format') then
    alter table public.users
      add constraint users_verified_dob_format
      check (verified_dob is null or verified_dob ~ '^\d{4}(-\d{2}(-\d{2})?)?$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_verified_mobile_format') then
    alter table public.users
      add constraint users_verified_mobile_format
      check (verified_mobile is null or verified_mobile ~ '^\+\d{6,15}$');
  end if;
end $$;

create unique index if not exists users_singpass_sub_key
  on public.users (singpass_sub)
  where singpass_sub is not null;

revoke select (singpass_sub, verified_name, verified_dob, verified_mobile),
       insert (singpass_sub, verified_name, verified_dob, verified_mobile),
       update (singpass_sub, verified_name, verified_dob, verified_mobile)
  on public.users from anon, authenticated;

alter table public.users drop constraint if exists users_verification_method_check;
alter table public.users
  add constraint users_verification_method_check
  check (verification_method is null or verification_method in ('manual', 'stripe_identity', 'singpass'));

alter table public.verification_reviews drop constraint if exists verification_reviews_method_check;
alter table public.verification_reviews
  add constraint verification_reviews_method_check
  check (method in ('manual', 'stripe_identity', 'singpass'));

create table if not exists public.singpass_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  state text not null,
  nonce text not null,
  code_verifier text not null,
  dpop_private_jwk jsonb not null,
  dpop_public_jwk jsonb not null,
  teaching_plan text check (teaching_plan is null or char_length(teaching_plan) <= 600),
  created_at timestamptz not null default now()
);

-- Filled by singpass-callback once Singpass returns; read back on confirm.
alter table public.singpass_auth_sessions
  add column if not exists retrieved_sub text,
  add column if not exists retrieved_name text,
  add column if not exists retrieved_dob text,
  add column if not exists retrieved_mobile text,
  add column if not exists retrieved_at timestamptz;

create unique index if not exists singpass_auth_sessions_state_key
  on public.singpass_auth_sessions (state);

create index if not exists singpass_auth_sessions_created_at_idx
  on public.singpass_auth_sessions (created_at);

alter table public.singpass_auth_sessions enable row level security;

revoke all on table public.singpass_auth_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.singpass_auth_sessions to service_role;

drop function if exists public.record_singpass_verification(uuid, text, text, text);

create or replace function public.record_singpass_verification(
  p_user_id uuid,
  p_sub text,
  p_name text,
  p_dob text,
  p_mobile text default null,
  p_teaching_plan text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_plan text := nullif(btrim(coalesce(p_teaching_plan, '')), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_dob text := nullif(btrim(coalesce(p_dob, '')), '');
  v_mobile text := nullif(btrim(coalesce(p_mobile, '')), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  if coalesce(btrim(p_sub), '') = '' then
    raise exception 'singpass identifier is required';
  end if;

  if v_name is null then
    raise exception 'singpass name is required';
  end if;

  if v_dob is null or v_dob !~ '^\d{4}(-\d{2}(-\d{2})?)?$' then
    raise exception 'singpass date of birth is required';
  end if;

  -- singpass-callback also refuses partial dates that could be under 18.
  if v_dob ~ '^\d{4}-\d{2}-\d{2}$'
     and v_dob::date > ((now() at time zone 'Asia/Singapore')::date - interval '18 years') then
    raise exception 'under 18';
  end if;

  if v_plan is not null and char_length(v_plan) > 600 then
    raise exception 'what you plan to teach must be 600 characters or fewer';
  end if;

  if exists (
    select 1 from public.users
    where singpass_sub = p_sub and id <> p_user_id
  ) then
    raise exception 'singpass already linked';
  end if;

  select verification_status into v_status
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  if v_status = 'approved' then
    raise exception 'already verified';
  end if;

  update public.users
  set singpass_sub = p_sub,
      verified_name = v_name,
      verified_dob = v_dob,
      verified_mobile = v_mobile,
      teaching_plan = coalesce(v_plan, teaching_plan),
      verification_status = 'pending',
      verification_method = 'singpass',
      verification_submitted_at = now(),
      verification_consent_at = now(),
      verification_rejection_reason = null,
      verification_reviewed_at = null
  where id = p_user_id;

  return 'pending';
end;
$$;

revoke all on function public.record_singpass_verification(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_singpass_verification(uuid, text, text, text, text, text) to service_role;

-- Same as 00007 apart from accepting 'singpass'.
create or replace function public.review_verification(
  p_user_id uuid,
  p_decision text,
  p_reason text default null,
  p_method text default 'manual',
  p_reviewer_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;

  if p_decision = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'a rejection reason is required';
  end if;

  if p_method not in ('manual', 'stripe_identity', 'singpass') then
    raise exception 'method must be manual, stripe_identity or singpass';
  end if;

  select verification_status into v_status
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user not found';
  end if;

  -- Idempotent: a repeated webhook or a double-clicked button is a no-op.
  if v_status = p_decision then
    return v_status;
  end if;

  update public.users
  set verification_status = p_decision,
      verification_method = p_method,
      verification_reviewed_at = now(),
      verification_rejection_reason = case when p_decision = 'rejected' then p_reason else null end
  where id = p_user_id;

  insert into public.verification_reviews (user_id, reviewer_id, decision, reason, method)
  values (p_user_id, p_reviewer_id, p_decision, p_reason, p_method);

  return p_decision;
end;
$$;

revoke all on function public.review_verification(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.review_verification(uuid, text, text, text, uuid) to service_role;
