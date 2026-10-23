-- Manual review is now the only verification route (DECISIONS.md, 23 October):
-- Stripe Identity is not available to Singapore-based businesses, so live
-- sessions are refused. Hosts also describe what they plan to teach, so the
-- reviewer gets a sense of the listing before approving.
--
--   * users.teaching_plan: free text, at most 600 characters. Private: no
--     client role can SELECT or UPDATE it; it is written only through
--     submit_verification and read by admin-verifications (service role) and
--     the database webhook that emails the reviewer.
--   * submit_verification gains p_teaching_plan, default null, so a page that
--     still sends three arguments keeps working while a deploy rolls out. The
--     page requires it; the database only trims and bounds it.
--
-- Safe to run more than once.

alter table public.users
  add column if not exists teaching_plan text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_teaching_plan_length') then
    alter table public.users
      add constraint users_teaching_plan_length
      check (teaching_plan is null or char_length(teaching_plan) <= 600);
  end if;
end $$;

-- Column grants on users are explicit (00005, 00023), so a new column has none.
-- Revoke anyway so a later additive GRANT cannot expose it by accident.
revoke select (teaching_plan), insert (teaching_plan), update (teaching_plan)
  on public.users from anon, authenticated;

drop function if exists public.submit_verification(text, text, boolean);

create or replace function public.submit_verification(
  p_id_photo_url text,
  p_selfie_url text,
  p_consent boolean,
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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_consent is not true then
    raise exception 'consent is required to submit identity documents';
  end if;

  if coalesce(p_id_photo_url, '') = '' or coalesce(p_selfie_url, '') = '' then
    raise exception 'both an ID document and a selfie are required';
  end if;

  if v_plan is not null and char_length(v_plan) > 600 then
    raise exception 'what you plan to teach must be 600 characters or fewer';
  end if;

  select verification_status into v_status
  from public.users
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  if v_status not in ('unverified', 'rejected') then
    raise exception 'verification cannot be submitted from status %', v_status;
  end if;

  update public.users
  set id_photo_url = p_id_photo_url,
      selfie_url = p_selfie_url,
      teaching_plan = coalesce(v_plan, teaching_plan),
      verification_status = 'pending',
      verification_method = 'manual',
      verification_submitted_at = now(),
      verification_consent_at = now(),
      verification_rejection_reason = null,
      verification_reviewed_at = null
  where id = auth.uid();

  return 'pending';
end;
$$;

revoke all on function public.submit_verification(text, text, boolean, text) from public, anon;
grant execute on function public.submit_verification(text, text, boolean, text) to authenticated;
