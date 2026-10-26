import { describe, expect, it, vi } from 'vitest'
import { HOST_SESSIONS_SELECT } from './listingDelete'
import {
  HOST_OPEN_SESSIONS_LIMIT,
  HOST_OPEN_SESSIONS_SELECT,
  calendarDayMarks,
  fetchHostOpenSessions,
  fetchHostOwnSessions,
  hostProfileStats,
  nextOpenSession,
  sessionsOnDay,
  teachCategories,
} from './profileHeader'

const NOW = Date.parse('2026-10-26T04:00:00.000Z')

describe('hostProfileStats', () => {
  it('hides the rating when there are no reviews', () => {
    expect(hostProfileStats([], [{ id: 'a' }])).toEqual({
      average: null,
      reviewCount: 0,
      listingCount: 1,
    })
  })

  it('averages every review they received as a host', () => {
    expect(hostProfileStats([{ rating: 5 }, { rating: 4 }], [{ id: 'a' }])).toEqual({
      average: 4.5,
      reviewCount: 2,
      listingCount: 1,
    })
  })
})

describe('teachCategories', () => {
  it('lists distinct categories in first-seen order', () => {
    expect(
      teachCategories([
        { category: 'Food' },
        { category: 'Food' },
        { category: 'Music' },
        { category: 'Arts' },
      ]),
    ).toEqual(['Food', 'Music', 'Arts'])
  })

  it('skips a blank category', () => {
    expect(teachCategories([{ category: '  ' }, { category: 'Fitness' }])).toEqual(['Fitness'])
  })
})

describe('nextOpenSession', () => {
  it('picks the soonest open session', () => {
    expect(
      nextOpenSession(
        [
          {
            listing_id: 'listing-8',
            starts_at: '2026-12-01T02:00:00.000Z',
            status: 'open',
            listings: { title: 'Open mic' },
          },
          {
            listing_id: 'listing-9',
            starts_at: '2026-10-28T02:00:00.000Z',
            status: 'open',
            listings: { title: 'Latte art' },
          },
          { listing_id: 'listing-8', starts_at: '2026-10-27T02:00:00.000Z', status: 'full' },
        ],
        [],
        NOW,
      ),
    ).toEqual({
      listingId: 'listing-9',
      title: 'Latte art',
      startsAt: '2026-10-28T02:00:00.000Z',
    })
  })

  it('returns null when there is no open future session', () => {
    expect(nextOpenSession([], [], NOW)).toBeNull()
  })
})

describe('calendarDayMarks', () => {
  const sessions = [
    {
      listing_id: 'listing-9',
      starts_at: '2026-10-28T02:00:00.000Z',
      status: 'open',
      bookings: [{ status: 'confirmed' }],
    },
    {
      listing_id: 'listing-8',
      starts_at: '2026-10-29T02:00:00.000Z',
      status: 'open',
      bookings: [],
    },
    {
      listing_id: 'listing-8',
      starts_at: '2026-10-30T02:00:00.000Z',
      status: 'full',
      bookings: [{ status: 'pending' }],
    },
  ]

  it('marks booked days solid and open-unbooked days hollow on the own calendar', () => {
    expect(calendarDayMarks(sessions, { publicView: false, now: NOW })).toEqual({
      '2026-10-28': 'booked',
      '2026-10-29': 'open',
    })
  })

  it('never paints an open ring on a past Singapore day', () => {
    expect(
      calendarDayMarks(
        [
          {
            listing_id: 'listing-8',
            starts_at: '2026-10-25T02:00:00.000Z',
            status: 'open',
            bookings: [],
          },
          {
            listing_id: 'listing-9',
            starts_at: '2026-10-24T02:00:00.000Z',
            status: 'open',
            bookings: [{ status: 'confirmed' }],
          },
        ],
        { publicView: false, now: NOW },
      ),
    ).toEqual({
      '2026-10-24': 'booked',
    })
  })

  it('paints today open only while a session today is still to come', () => {
    expect(
      calendarDayMarks(
        [
          {
            listing_id: 'listing-8',
            starts_at: '2026-10-26T02:00:00.000Z',
            status: 'open',
            bookings: [],
          },
        ],
        { publicView: false, now: NOW },
      ),
    ).toEqual({})
    expect(
      calendarDayMarks(
        [
          {
            listing_id: 'listing-8',
            starts_at: '2026-10-26T06:00:00.000Z',
            status: 'open',
            bookings: [],
          },
        ],
        { publicView: false, now: NOW },
      ),
    ).toEqual({
      '2026-10-26': 'open',
    })
  })

  it('never marks a booked day on the public calendar', () => {
    expect(calendarDayMarks(sessions, { publicView: true, now: NOW })).toEqual({
      '2026-10-28': 'open',
      '2026-10-29': 'open',
    })
  })
})

describe('sessionsOnDay', () => {
  it('lists only open future sessions on a public day', () => {
    const rows = sessionsOnDay(
      [
        { listing_id: 'a', starts_at: '2026-10-28T02:00:00.000Z', status: 'open' },
        { listing_id: 'a', starts_at: '2026-10-28T04:00:00.000Z', status: 'full' },
      ],
      '2026-10-28',
      { publicView: true, now: NOW },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('open')
  })
})

describe('fetchHostOpenSessions', () => {
  it('selects only public session columns and joins approved active listings', () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
    const client = { from: vi.fn(() => builder) }

    fetchHostOpenSessions(client, 'host-1', new Date('2026-10-26T04:00:00.000Z'))

    expect(client.from).toHaveBeenCalledWith('sessions')
    expect(builder.select).toHaveBeenCalledWith(HOST_OPEN_SESSIONS_SELECT)
    expect(HOST_OPEN_SESSIONS_SELECT).not.toMatch(/review_note|host_reminder|full_address|bookings/)
    expect(builder.eq).toHaveBeenCalledWith('status', 'open')
    expect(builder.eq).toHaveBeenCalledWith('listings.host_id', 'host-1')
    expect(builder.limit).toHaveBeenCalledWith(HOST_OPEN_SESSIONS_LIMIT)
  })
})

describe('fetchHostOwnSessions', () => {
  it('uses the Hosting sessions select that embeds the host bookings', () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    }
    const client = { from: vi.fn(() => builder) }

    fetchHostOwnSessions(client, ['listing-9'], NOW)

    expect(builder.select).toHaveBeenCalledWith(HOST_SESSIONS_SELECT)
    expect(HOST_SESSIONS_SELECT).toMatch(/bookings/)
    expect(builder.in).toHaveBeenCalledWith('listing_id', ['listing-9'])
    expect(builder.neq).toHaveBeenCalledWith('status', 'cancelled')
  })
})
