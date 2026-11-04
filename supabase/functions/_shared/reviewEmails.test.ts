import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  callerOwnsReview,
  reviewWindowOpen,
  sendReviewFollowUpEmails,
  shouldEmailOtherParty,
} from './reviewEmails.ts'

const source = readFileSync(resolve(import.meta.dirname, '../review-emails/index.ts'), 'utf8')

const review = {
  id: 'r1',
  reviewer_id: 'guest-1',
  reviewee_id: 'host-1',
  role: 'guest',
  booking_id: 'booking-1',
  other_party_emailed_at: null,
  reveal_after: '2026-11-10T00:00:00Z',
}

const people = {
  guest: { id: 'guest-1', display_name: 'Sam', email: 'sam@example.com' },
  host: { id: 'host-1', display_name: 'Mei', email: 'mei@example.com' },
}

describe('review-emails rules', () => {
  it('only the reviewer may trigger the emails', () => {
    expect(callerOwnsReview(review, 'guest-1')).toBe(true)
    expect(callerOwnsReview(review, 'host-1')).toBe(false)
    expect(callerOwnsReview(null, 'guest-1')).toBe(false)
  })

  it('skips the other party when they already reviewed, the window closed, or we already emailed', () => {
    expect(
      shouldEmailOtherParty({ otherReviewed: false, windowOpen: true, alreadyEmailed: false }),
    ).toBe(true)
    expect(
      shouldEmailOtherParty({ otherReviewed: true, windowOpen: true, alreadyEmailed: false }),
    ).toBe(false)
    expect(
      shouldEmailOtherParty({ otherReviewed: false, windowOpen: false, alreadyEmailed: false }),
    ).toBe(false)
    expect(
      shouldEmailOtherParty({ otherReviewed: false, windowOpen: true, alreadyEmailed: true }),
    ).toBe(false)
    expect(reviewWindowOpen('2026-11-10T00:00:00Z', Date.parse('2026-11-01T00:00:00Z'))).toBe(true)
    expect(reviewWindowOpen('2026-11-01T00:00:00Z', Date.parse('2026-11-10T00:00:00Z'))).toBe(false)
  })

  it('emails the host after a guest review, then is a no-op on a second call', async () => {
    const sendEmail = vi.fn(async () => {})
    const claimOtherParty = vi.fn(async () => true)
    const claimNote = vi.fn(async () => true)
    const first = await sendReviewFollowUpEmails({
      callerId: 'guest-1',
      review,
      otherReviewed: false,
      privateNote: null,
      ...people,
      listingTitle: 'Latte art',
      claimOtherParty,
      claimNote,
      sendEmail,
      siteUrl: 'https://trykai.sg',
      apiKey: 're_test',
      now: Date.parse('2026-11-01T00:00:00Z'),
    })
    expect(first).toEqual({ otherParty: true, privateNote: false })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0][0].to).toBe('mei@example.com')
    expect(sendEmail.mock.calls[0][0].subject).toBe('Sam reviewed Latte art')
    expect(sendEmail.mock.calls[0][0].html).toContain('Review Sam by')
    expect(sendEmail.mock.calls[0][0].html).toContain('/u/host-1?tab=hosting')

    const second = await sendReviewFollowUpEmails({
      callerId: 'guest-1',
      review: { ...review, other_party_emailed_at: '2026-11-01T00:00:00Z' },
      otherReviewed: false,
      privateNote: null,
      ...people,
      listingTitle: 'Latte art',
      claimOtherParty,
      claimNote,
      sendEmail,
      siteUrl: 'https://trykai.sg',
      apiKey: 're_test',
      now: Date.parse('2026-11-01T00:00:00Z'),
    })
    expect(second.otherParty).toBe(false)
    expect(claimOtherParty).toHaveBeenCalledTimes(1)
  })

  it('emails the guest after a host review and forwards an escaped private note', async () => {
    const sendEmail = vi.fn(async () => {})
    const result = await sendReviewFollowUpEmails({
      callerId: 'host-1',
      review: { ...review, reviewer_id: 'host-1', role: 'host' },
      otherReviewed: false,
      privateNote: { id: 'n1', note: '<script>alert(1)</script>', emailed_at: null },
      ...people,
      listingTitle: 'Latte art',
      claimOtherParty: async () => true,
      claimNote: async () => true,
      sendEmail,
      siteUrl: 'https://trykai.sg',
      apiKey: 're_test',
      now: Date.parse('2026-11-01T00:00:00Z'),
    })
    expect(result).toEqual({ otherParty: true, privateNote: true })
    expect(sendEmail.mock.calls[0][0].subject).toBe('Mei reviewed you')
    expect(sendEmail.mock.calls[0][0].html).toContain('/bookings/booking-1#review')
    const ops = sendEmail.mock.calls[1][0]
    expect(ops.to).toBe('hello@trykai.sg')
    expect(ops.subject).toBe('Private note on a review')
    expect(ops.replyTo).toBe('mei@example.com')
    expect(ops.html).toContain('BOOKING-')
    expect(ops.html).not.toContain('<script>alert(1)</script>')
    expect(ops.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('skips the other-party email when the claim loses, and a note already emailed', async () => {
    const sendEmail = vi.fn(async () => {})
    const result = await sendReviewFollowUpEmails({
      callerId: 'guest-1',
      review,
      otherReviewed: false,
      privateNote: { id: 'n1', note: 'already sent', emailed_at: '2026-11-01T00:00:00Z' },
      guest: { id: 'guest-1' },
      host: { id: 'host-1' },
      listingTitle: 'Latte art',
      claimOtherParty: async () => false,
      claimNote: async () => true,
      sendEmail,
      siteUrl: 'https://trykai.sg',
      apiKey: 're_test',
      now: Date.parse('2026-11-01T00:00:00Z'),
    })
    expect(result).toEqual({ otherParty: false, privateNote: false })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not send when a stranger calls', async () => {
    const sendEmail = vi.fn(async () => {})
    const result = await sendReviewFollowUpEmails({
      callerId: 'stranger',
      review,
      otherReviewed: false,
      privateNote: { id: 'n1', note: 'hi', emailed_at: null },
      ...people,
      listingTitle: 'Latte art',
      claimOtherParty: async () => true,
      claimNote: async () => true,
      sendEmail,
      siteUrl: 'https://trykai.sg',
      apiKey: 're_test',
    })
    expect(result.error).toBe('forbidden')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('claims before send so a lost race does not email twice', () => {
    expect(source).toContain('update({ other_party_emailed_at:')
    expect(source).toContain(".is('other_party_emailed_at', null)")
    expect(source).toContain(".is('emailed_at', null)")
    expect(source).toContain('auth.getUser()')
    expect(source).toContain("jsonResponse({ error: 'Forbidden' }, 403)")
  })
})
