import { describe, expect, it } from 'vitest'
import {
  addonGuestLine,
  bookedSeats,
  guestInitials,
  hasBlockingBookings,
  nextUpSessions,
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

describe('nextUpSessions (multiple locations, 00059)', () => {
  const at = (iso, overrides = {}) =>
    session({ listing_id: 'l1', starts_at: iso, ...overrides })

  it('is empty with nothing booked, and one session on its own', () => {
    expect(nextUpSessions([], listing)).toEqual([])
    expect(nextUpSessions(undefined, listing)).toEqual([])
    const only = at('2026-11-21T06:00:00Z')
    expect(nextUpSessions([only, at('2026-11-22T06:00:00Z', { id: 's-2' })], listing)).toEqual([only])
  })

  it("adds the listing's other places running at the same time, location 1 first", () => {
    const bedok = at('2026-11-21T06:00:00Z', { id: 'bedok', location_id: 'loc-2' })
    const bishan = at('2026-11-21T06:00:00Z', { id: 'bishan', location_id: 'loc-1' })
    const later = at('2026-11-21T09:00:00Z', { id: 'later', location_id: 'loc-1' })
    const rank = { 'loc-1': 0, 'loc-2': 1 }
    expect(nextUpSessions([bedok, bishan, later], listing, rank).map((s) => s.id)).toEqual(['bishan', 'bedok'])
    // Places it can't rank go last.
    const removed = at('2026-11-21T06:00:00Z', { id: 'removed', location_id: 'loc-gone' })
    expect(nextUpSessions([removed, bedok], listing, rank).map((s) => s.id)).toEqual(['bedok', 'removed'])
  })

  it('counts a session that starts before the first one ends, but not one that starts as it ends', () => {
    const first = at('2026-11-21T06:00:00Z', { id: 'first' })
    const overlapping = at('2026-11-21T07:00:00Z', { id: 'overlapping' })
    const after = at('2026-11-21T07:30:00Z', { id: 'after' }) // 90 minutes on
    expect(nextUpSessions([first, overlapping, after], listing).map((s) => s.id)).toEqual(['first', 'overlapping'])
    // A session's own length wins over the listing's.
    const short = at('2026-11-21T06:00:00Z', { id: 'short', duration_mins: 30 })
    expect(nextUpSessions([short, overlapping], listing).map((s) => s.id)).toEqual(['short'])
  })

  it("leaves out another listing's session, even at the same time", () => {
    const mine = at('2026-11-21T06:00:00Z', { id: 'mine' })
    const other = at('2026-11-21T06:00:00Z', { id: 'other', listing_id: 'l2' })
    expect(nextUpSessions([mine, other], listing).map((s) => s.id)).toEqual(['mine'])
  })
})
