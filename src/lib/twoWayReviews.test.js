import { describe, expect, it, vi } from 'vitest'
import {
  daysLeftUntil,
  firstRow,
  hostRatingFromRpc,
  notifyReviewEmails,
  reviewClosedOnLabel,
  reviewIsPublic,
  reviewRpcErrorMessage,
} from './twoWayReviews'
import { supabase } from './supabase'

vi.mock('./supabase')

describe('twoWayReviews helpers', () => {
  it('treats a review as public once revealed_at is set or the window has passed', () => {
    expect(reviewIsPublic({ revealed_at: '2026-11-01T00:00:00Z' })).toBe(true)
    expect(
      reviewIsPublic({ reveal_after: '2026-11-01T00:00:00Z' }, Date.parse('2026-11-02T00:00:00Z')),
    ).toBe(true)
    expect(
      reviewIsPublic({ reveal_after: '2026-11-10T00:00:00Z' }, Date.parse('2026-11-02T00:00:00Z')),
    ).toBe(false)
    expect(reviewIsPublic({ reveal_after: 'not-a-date' })).toBe(false)
    expect(reviewIsPublic({})).toBe(false)
    expect(reviewIsPublic(null)).toBe(false)
  })

  it('maps post_review errors to the canvas copy', () => {
    expect(reviewRpcErrorMessage({ message: 'already_reviewed' })).toBe(
      "You've already reviewed this booking.",
    )
    expect(reviewRpcErrorMessage({ message: 'review_window_closed' }, { closedOn: 'Sat, 10 Nov' })).toBe(
      'Reviews for this session closed on Sat, 10 Nov.',
    )
    expect(reviewRpcErrorMessage({ message: 'review_window_closed' })).toBe(
      'Reviews for this session have closed.',
    )
    expect(reviewRpcErrorMessage({ message: 'not_allowed' })).toBe("You can't review this booking.")
    expect(reviewRpcErrorMessage({ message: 'boom' })).toBe('boom')
    expect(reviewRpcErrorMessage({})).toBe("That review didn't save. Try again.")
  })

  it('reads host_rating rows defensively', () => {
    expect(hostRatingFromRpc([{ average: '4.5', review_count: 2 }], null)).toEqual({
      average: 4.5,
      reviewCount: 2,
    })
    expect(hostRatingFromRpc([{ average: 'nope', review_count: 1 }], null)).toEqual({
      average: null,
      reviewCount: 1,
    })
    expect(hostRatingFromRpc([], null)).toEqual({ average: null, reviewCount: 0 })
    expect(hostRatingFromRpc(null, { message: 'missing' })).toEqual({ average: null, reviewCount: 0 })
  })

  it('counts whole days left and labels the close date in Singapore time', () => {
    expect(daysLeftUntil('2026-11-10T00:00:00+08:00', Date.parse('2026-11-08T00:00:00+08:00'))).toBe(2)
    expect(daysLeftUntil('not-a-date')).toBe(0)
    expect(daysLeftUntil('2026-11-01T00:00:00Z', Date.parse('2026-11-10T00:00:00Z'))).toBe(0)
    expect(reviewClosedOnLabel('2026-11-10T04:00:00.000Z', Date.parse('2026-11-03T00:00:00Z'))).toMatch(
      /Nov/,
    )
    expect(firstRow([{ a: 1 }])).toEqual({ a: 1 })
    expect(firstRow({ a: 1 })).toEqual({ a: 1 })
    expect(firstRow('x')).toBeNull()
  })

  it('calls review-emails without throwing when the function fails', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    supabase.functions.invoke.mockRejectedValueOnce(new Error('down'))
    await expect(notifyReviewEmails('r1')).resolves.toBeUndefined()
    await expect(notifyReviewEmails('')).resolves.toBeUndefined()
  })
})
