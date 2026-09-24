import { describe, expect, it } from 'vitest'
import { canLeaveGuestReview } from './reviewGate'
import { hoursFromNow } from '../test/fixtures'

function endedConfirmedBooking(overrides = {}) {
  return {
    id: 'booking-past',
    status: 'confirmed',
    sessions: {
      starts_at: hoursFromNow(-5),
      duration_mins: 90,
    },
    ...overrides,
  }
}

describe('canLeaveGuestReview', () => {
  it('pending booking cannot insert a review', () => {
    expect(canLeaveGuestReview(endedConfirmedBooking({ status: 'pending' }))).toBe(false)
  })

  it('review before the session ends is rejected', () => {
    expect(
      canLeaveGuestReview({
        id: 'booking-live',
        status: 'confirmed',
        sessions: {
          starts_at: hoursFromNow(-1),
          duration_mins: 120,
        },
      })
    ).toBe(false)
  })

  it('second review on the same booking fails', () => {
    expect(canLeaveGuestReview(endedConfirmedBooking(), { alreadyReviewed: true })).toBe(false)
  })

  it('allows one guest review after a confirmed session has ended', () => {
    expect(canLeaveGuestReview(endedConfirmedBooking())).toBe(true)
  })
})
