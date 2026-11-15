import { describe, expect, it } from 'vitest'
import {
  addonGuestLine,
  bookedSeats,
  guestInitials,
  hasBlockingBookings,
  relativeDayLabel,
  sessionCapacity,
  sessionDateTile,
  sessionGuestCards,
  sessionSpotsLine,
  sessionTimeRange,
  upcomingDatesSummary,
} from './hostSessions'

const NOW = Date.parse('2026-11-15T04:00:00Z') // Sun 15 Nov, noon in Singapore
const listing = { max_guests: 4, duration_mins: 90, booking_cutoff_hours: 3 }

function session(overrides = {}) {
  return {
    id: 's-1',
    starts_at: '2026-11-21T06:00:00Z', // Sat 21 Nov, 2:00 pm in Singapore
    bookings: [{ id: 'b-1', status: 'confirmed', guests_count: 1 }],
    ...overrides,
  }
}

describe('host session helpers', () => {
  it('counts paid seats only, and blocks a time change on any checkout', () => {
    const mixed = session({
      bookings: [
        { id: 'b-1', status: 'confirmed', guests_count: 2 },
        { id: 'b-2', status: 'pending', guests_count: 1 },
        { id: 'b-3', status: 'cancelled', guests_count: 3 },
      ],
    })
    expect(bookedSeats(mixed)).toBe(2)
    expect(hasBlockingBookings(mixed)).toBe(true)
    expect(hasBlockingBookings(session({ bookings: [{ status: 'cancelled' }] }))).toBe(false)
  })

  it('takes spots from the session, then the listing', () => {
    expect(sessionCapacity(session({ spots_total: 6 }), listing)).toBe(6)
    expect(sessionCapacity(session(), listing)).toBe(4)
    expect(sessionCapacity(session(), {})).toBe(0)
  })

  it('writes the time range once per half of the day', () => {
    expect(sessionTimeRange(session(), listing)).toBe('2:00 – 3:30 pm')
    expect(sessionTimeRange(session({ starts_at: '2026-11-21T03:00:00Z' }), listing)).toBe(
      '11:00 am – 12:30 pm',
    )
    expect(sessionTimeRange(session({ duration_mins: 60 }), listing)).toBe('2:00 – 3:00 pm')
  })

  it('builds the date tile and how far away it is', () => {
    expect(sessionDateTile('2026-11-21T06:00:00Z')).toEqual({ weekday: 'SAT', day: '21', month: 'NOV' })
    expect(relativeDayLabel('2026-11-21T06:00:00Z', NOW)).toBe('in 6 days')
    expect(relativeDayLabel('2026-11-16T01:00:00Z', NOW)).toBe('tomorrow')
    expect(relativeDayLabel('2026-11-15T12:00:00Z', NOW)).toBe('today')
  })

  it('sums up the dates on a listing', () => {
    expect(upcomingDatesSummary({ booked: 1, open: 2 })).toBe('1 with bookings · 2 open')
    expect(upcomingDatesSummary({ open: 1, held: 1 })).toBe('1 open · 1 taken')
    expect(upcomingDatesSummary({})).toBe('No dates yet')
  })

  it('makes initials from a display name', () => {
    expect(guestInitials('Wei Ling T.')).toBe('WL')
    expect(guestInitials('kai')).toBe('K')
    expect(guestInitials('  ')).toBe('G')
  })

  it('lists add-ons with a count only past one', () => {
    expect(addonGuestLine([{ name: 'Premium materials', quantity: 1 }, { name: 'Vase', quantity: 2 }])).toBe(
      'Premium materials, Vase × 2',
    )
    expect(addonGuestLine(undefined)).toBe('')
  })

  it('builds one card per paid booking with friends, add-ons and the note', () => {
    const cards = sessionGuestCards(
      session({
        bookings: [
          { id: 'b-1', status: 'confirmed', guests_count: 2 },
          { id: 'b-2', status: 'pending', guests_count: 1 },
        ],
      }),
      {
        guestRows: [
          { booking_id: 'b-1', display_name: 'Wei Ling T.', is_companion: false },
          { booking_id: 'b-1', display_name: 'Sam', is_companion: true },
        ],
        addonsByBooking: { 'b-1': [{ name: 'Premium materials', quantity: 1 }] },
        notesByBooking: { 'b-1': { note: 'Is there parking nearby?' } },
      },
    )
    expect(cards).toEqual([
      {
        id: 'b-1',
        name: 'Wei Ling T.',
        spots: 2,
        friends: ['Sam'],
        addons: 'Premium materials',
        note: 'Is there parking nearby?',
      },
    ])
    expect(sessionGuestCards(session())[0].name).toBe('Guest')
  })

  it("says what is still open and when this listing's bookings close", () => {
    expect(sessionSpotsLine(session(), listing, NOW)).toBe(
      '3 spots still open. Bookings close 3 hours before, as set on this listing.',
    )
    expect(sessionSpotsLine(session(), { ...listing, booking_cutoff_hours: 24 }, NOW)).toBe(
      '3 spots still open. Bookings close 24 hours before, as set on this listing.',
    )
    // An unknown setting falls back to the default.
    expect(sessionSpotsLine(session(), { ...listing, booking_cutoff_hours: 5 }, NOW)).toMatch(/close 3 hours/)
    expect(sessionSpotsLine(session(), listing, Date.parse('2026-11-21T04:00:00Z'))).toBe(
      '3 spots still open. Bookings have closed for this session.',
    )
    expect(
      sessionSpotsLine(session({ bookings: [{ status: 'confirmed', guests_count: 4 }] }), listing, NOW),
    ).toBe('Every spot is booked.')
    expect(
      sessionSpotsLine(session({ bookings: [{ status: 'confirmed', guests_count: 3 }] }), listing, NOW),
    ).toMatch(/^1 spot still open\./)
  })
})
