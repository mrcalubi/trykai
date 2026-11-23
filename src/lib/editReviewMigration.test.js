import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00058_edit_review_until_revealed.sql'),
  'utf8',
)
const checkSql = readFileSync(
  resolve(import.meta.dirname, '../../supabase/tests/edit_review_check.sql'),
  'utf8',
)

const body = migration.slice(migration.indexOf('create or replace function public.edit_review'))

describe('00058 edit a review until it goes live', () => {
  it('adds edited_at only', () => {
    expect(migration).toMatch(/add column if not exists edited_at timestamptz/)
    expect(migration).not.toMatch(/drop function/i)
    expect(migration).not.toMatch(/grant update/i)
  })

  it('lets only the author edit, under the same booking lock as the reveal', () => {
    expect(body).toMatch(/r\.reviewer_id = v_uid/)
    expect(body).toMatch(/from public\.bookings where id = v_booking_id for update/)
    // The review is read again after the lock, so a reveal that won the lock is seen.
    const lockAt = body.indexOf('for update')
    expect(body.indexOf('select r.* into v_review', lockAt)).toBeGreaterThan(lockAt)
  })

  it('refuses once revealed or once the window has passed', () => {
    expect(body).toMatch(/v_review\.revealed_at is not null then\s+raise exception 'review_revealed'/)
    expect(body).toMatch(/now\(\) >= v_review\.reveal_after then\s+raise exception 'review_window_closed'/)
  })

  it('keeps the post_review rules for hosts', () => {
    expect(body).toMatch(/char_length\(v_comment\) < 10 or char_length\(v_comment\) > 1000/)
    expect(body).toMatch(/cardinality\(v_photos\) <> 0/)
    expect(body).toMatch(/p_rating < 1 or p_rating > 5/)
  })

  it('changes only rating, comment, photos and edited_at', () => {
    const update = body.slice(body.indexOf('update public.reviews'), body.indexOf('return jsonb_build_object'))
    expect(update).toMatch(/rating = p_rating/)
    expect(update).toMatch(/comment = v_comment/)
    expect(update).toMatch(/photo_paths = v_photos/)
    expect(update).toMatch(/edited_at = now\(\)/)
    expect(update).not.toMatch(/reveal/)
    expect(update).not.toMatch(/other_party_emailed_at/)
    expect(body).not.toMatch(/review_notes/)
  })

  it('is callable by signed-in users only', () => {
    expect(migration).toMatch(
      /revoke all on function public\.edit_review\(uuid, integer, text, text\[]\) from public, anon;\s*grant execute on function public\.edit_review\(uuid, integer, text, text\[]\) to authenticated;/,
    )
  })

  it('has a rollback check covering reveal, window, author and direct UPDATE', () => {
    expect(checkSql).toMatch(/^begin;/m)
    expect(checkSql).toMatch(/^rollback;/m)
    expect(checkSql).toMatch(/review_revealed/)
    expect(checkSql).toMatch(/review_window_closed/)
    expect(checkSql).toMatch(/stranger edit should have failed/)
    expect(checkSql).toMatch(/direct UPDATE on reviews should be refused/)
  })
})
