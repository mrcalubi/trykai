import { describe, expect, it } from 'vitest'
import { listingUpcomingStats, upcomingSessionsFrom } from './listingDelete'

describe('listingUpcomingStats', () => {
  it('counts upcoming sessions and confirmed bookings for one listing', () => {
    const sessions = [
      {
        listing_id: 'listing-1',
        starts_at: '2099-01-01T00:00:00.000Z',
        bookings: [
          { status: 'confirmed' },
          { status: 'pending' },
          { status: 'cancelled' },
        ],
      },
      {
        listing_id: 'listing-1',
        starts_at: '2099-01-02T00:00:00.000Z',
        bookings: [],
      },
      {
        listing_id: 'listing-2',
        starts_at: '2099-01-01T00:00:00.000Z',
        bookings: [{ status: 'confirmed' }],
      },
    ]

    expect(listingUpcomingStats('listing-1', sessions)).toEqual({
      sessionCount: 2,
      bookingCount: 1,
    })
  })
})

describe('upcomingSessionsFrom', () => {
  it('keeps only sessions that have not started', () => {
    const now = Date.parse('2026-10-26T00:00:00.000Z')
    const rows = [
      { id: 'past', starts_at: '2026-10-25T00:00:00.000Z' },
      { id: 'soon', starts_at: '2026-10-27T00:00:00.000Z' },
    ]

    expect(upcomingSessionsFrom(rows, now).map((session) => session.id)).toEqual(['soon'])
  })
})
