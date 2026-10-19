import { describe, expect, it } from 'vitest'
import {
  listingDatesLine,
  monthSessionsNote,
  monthSessionsToCount,
  monthStats,
} from './hostingDashboard'

const NOW = Date.parse('2026-10-15T04:00:00Z')
const booked = [{ status: 'confirmed', guests_count: 2, host_payout_amount: 3000 }]

describe('monthSessionsToCount', () => {
  it('keeps dates to come and past dates that had guests, and drops the rest', () => {
    const counted = monthSessionsToCount(
      [
        { id: 'past-empty', starts_at: '2026-10-02T02:00:00Z', bookings: [] },
        { id: 'past-pending', starts_at: '2026-10-03T02:00:00Z', bookings: [{ status: 'pending' }] },
        { id: 'held', starts_at: '2026-10-09T02:00:00Z', bookings: booked },
        { id: 'to-come', starts_at: '2026-10-21T02:00:00Z', bookings: [] },
        { id: 'next-month', starts_at: '2026-11-02T02:00:00Z', bookings: [] },
      ],
      NOW,
    )

    expect(counted.map((session) => [session.id, session.held])).toEqual([
      ['held', true],
      ['to-come', false],
    ])
    expect(monthStats(counted)).toEqual({
      sessions: 2,
      held: 1,
      toCome: 1,
      guests: 2,
      earnedCents: 3000,
    })
  })
})

describe('monthSessionsNote', () => {
  it('says how the total splits', () => {
    expect(monthSessionsNote({ held: 2, toCome: 5 })).toBe('2 held · 5 to come')
    expect(monthSessionsNote({ held: 2, toCome: 0 })).toBe('2 held')
    expect(monthSessionsNote({ held: 0, toCome: 1 })).toBe('1 to come')
    expect(monthSessionsNote({ held: 0, toCome: 0 })).toBe('')
  })
})

describe('listingDatesLine', () => {
  it('counts open and booked dates', () => {
    expect(listingDatesLine(0, 0)).toBe('No dates yet')
    expect(listingDatesLine(1, 0)).toBe('1 open date')
    expect(listingDatesLine(3, 0)).toBe('3 open dates')
    expect(listingDatesLine(2, 1)).toBe('2 open dates · 1 booked')
    expect(listingDatesLine(0, 2)).toBe('2 booked · no open dates')
  })
})
