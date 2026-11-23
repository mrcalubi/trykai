-- Edit a review until it goes live (DECISIONS.md, 23 November 2026).
--
-- The person who wrote a review can change its stars, words and (guests)
-- photos while it is still hidden: before the other side posts and before
-- reveal_after (session end + 7 days). Once it is public it is final.
--
-- edit_review takes the same booking row lock as reviews_reveal_when_both
-- (00048, widened in 00050), then re-reads the review. So either the edit
-- commits first and the reveal shows the edited review, or the reveal commits
-- first and the edit is refused with review_revealed. Nobody can change a
-- review after the other side can read it.
--
-- Clients still have no UPDATE grant on reviews; this function is the only
-- edit path. The private note is not editable (it was emailed to TryKai on
-- post). Edits send no email or Telegram message. Photos removed in an edit
-- stay in the review-photos bucket unreferenced, the same as failed uploads
-- (00047).
--
-- Additive only. Apply on staging, then production, before merging the
-- release. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. edited_at: for TryKai (disputes). Not returned by any public reader.
-- ---------------------------------------------------------------------------

alter table public.reviews
  add column if not exists edited_at timestamptz;

comment on column public.reviews.edited_at is
  'Last edit through edit_review, while the review was hidden. TryKai only; never shown publicly.';

-- ---------------------------------------------------------------------------
-- 2. edit_review
-- ---------------------------------------------------------------------------

create or replace function public.edit_review(
  p_review_id uuid,
  p_rating integer,
  p_comment text,
  p_photo_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking_id uuid;
  v_review public.reviews;
  v_comment text;
  v_photos text[] := coalesce(p_photo_paths, '{}');
begin
  if v_uid is null then
    raise exception 'not_allowed';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'not_allowed';
  end if;

  select r.booking_id into v_booking_id
  from public.reviews r
  where r.id = p_review_id
    and r.reviewer_id = v_uid;

  if v_booking_id is null then
    raise exception 'not_allowed';
  end if;

  -- Same lock the reveal trigger takes, then read the review again.
  perform 1 from public.bookings where id = v_booking_id for update;

  select r.* into v_review
  from public.reviews r
  where r.id = p_review_id
    and r.reviewer_id = v_uid;

  if v_review.id is null then
    raise exception 'not_allowed';
  end if;

  if v_review.revealed_at is not null then
    raise exception 'review_revealed';
  end if;

  if v_review.reveal_after is null or now() >= v_review.reveal_after then
    raise exception 'review_window_closed';
  end if;

  if v_review.role = 'guest' then
    v_comment := nullif(btrim(coalesce(p_comment, '')), '');
  elsif v_review.role = 'host' then
    v_comment := btrim(coalesce(p_comment, ''));
    if char_length(v_comment) < 10 or char_length(v_comment) > 1000 then
      raise exception 'not_allowed';
    end if;
    if cardinality(v_photos) <> 0 then
      raise exception 'not_allowed';
    end if;
  else
    raise exception 'not_allowed';
  end if;

  -- reviews_guard_photo_paths (00047) checks the paths when they change.
  update public.reviews
  set
    rating = p_rating,
    comment = v_comment,
    photo_paths = v_photos,
    edited_at = now()
  where id = v_review.id;

  return jsonb_build_object(
    'review_id', v_review.id,
    'revealed', false,
    'reveal_after', v_review.reveal_after
  );
end;
$$;

comment on function public.edit_review(uuid, integer, text, text[]) is
  'Reviewer edits their own review while it is hidden. Raises review_revealed, review_window_closed, or not_allowed.';

revoke all on function public.edit_review(uuid, integer, text, text[]) from public, anon;
grant execute on function public.edit_review(uuid, integer, text, text[]) to authenticated;
