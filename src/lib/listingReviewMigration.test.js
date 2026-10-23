import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../supabase/migrations/00036_singpass_auto_approve_and_listing_review.sql'
  ),
  'utf8'
)

describe('00036 Singpass auto-approval and listing review', () => {
  it('approves a Singpass host on the spot and logs it with no reviewer', () => {
    expect(migration).toMatch(/verification_status = 'approved',\s+verification_method = 'singpass'/)
    expect(migration).toMatch(
      /insert into public\.verification_reviews \(user_id, reviewer_id, decision, reason, method\)\s+values \(p_user_id, null, 'approved', null, 'singpass'\)/
    )
    expect(migration).toMatch(/return 'approved';/)
    expect(migration).toMatch(
      /grant execute on function public\.record_singpass_verification\(uuid, text, text, text, text, text\) to service_role/
    )
  })

  it('keeps existing listings live and starts new ones in review', () => {
    expect(migration).toMatch(/add column if not exists review_status text not null default 'approved'/)
    expect(migration).toMatch(/alter column review_status set default 'pending'/)
    expect(migration).toMatch(/check \(review_status in \('pending', 'approved', 'changes_requested'\)\)/)
  })

  it('never lets a client set the review fields', () => {
    expect(migration).toMatch(
      /revoke insert \(review_status, review_note, review_requested_at, reviewed_at, review_notified_at\),\s+update \(review_status, review_note, review_requested_at, reviewed_at, review_notified_at\)\s+on table public\.listings from anon, authenticated/
    )
    expect(migration).toMatch(/before insert or update on public\.listings/)
    expect(migration).toMatch(/new\.review_status := 'pending';/)
    expect(migration).toMatch(/new\.review_status := old\.review_status;/)
    // The note is for the host only: anon may read the status, never the note.
    expect(migration).toMatch(/grant select \(review_status\) on table public\.listings to anon, authenticated/)
    expect(migration).toMatch(/grant select \(review_note\) on table public\.listings to authenticated;/)
    expect(migration).not.toMatch(/grant select \(review_note\)[^;]*anon/)
  })

  it('hides unapproved listings from guests and from keen counts', () => {
    expect(migration).toMatch(
      /create policy "Anyone can view active listings"[\s\S]*?is_active = true\s+and review_status = 'approved'/
    )
    expect(migration).toMatch(/and l\.review_status = 'approved'/)
  })

  it('records decisions only from the service role, with a log row', () => {
    expect(migration).toMatch(/revoke all on table public\.listing_reviews from public, anon, authenticated/)
    expect(migration).toMatch(
      /revoke all on function public\.review_listing\(uuid, text, text, uuid\) from public, anon, authenticated/
    )
    expect(migration).toMatch(/grant execute on function public\.review_listing\(uuid, text, text, uuid\) to service_role/)
    expect(migration).toMatch(/a note for the host is required/)
    expect(migration).toMatch(/insert into public\.listing_reviews/)
  })
})
