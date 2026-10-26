import { describe, expect, it, vi } from 'vitest'
import {
  HOST_OPEN_SESSIONS_LIMIT,
  HOST_OPEN_SESSIONS_SELECT,
  fetchHostOpenSessions,
  hostProfileStats,
  hostingSummary,
  teachCategories,
} from './profileHeader'

const NOW = Date.parse('2026-10-26T04:00:00.000Z')

describe('hostProfileStats', () => {
  it('returns null when there are no live listings', () => {
    expect(hostProfileStats([{ rating: 5 }], [])).toBeNull()
  })

  it('hides the rating when there are listings but no reviews', () => {
    expect(hostProfileStats([], [{ id: 'a' }, { id: 'b' }])).toEqual({
      average: null,
      reviewCount: 0,
      listingCount: 2,
    })
  })

  it('averages every review they received as a host', () => {
    expect(
      hostProfileStats([{ rating: 5 }, { rating: 4 }], [{ id: 'a' }, { id: 'b' }]),
    ).toEqual({
      average: 4.5,
      reviewCount: 2,
      listingCount: 2,
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

describe('hostingSummary', () => {
  const listings = [
    { id: 'listing-9', title: 'Latte art', category: 'Food' },
    { id: 'listing-8', title: 'Open mic', category: 'Music' },
  ]

  it('returns null when there are no live listings', () => {
    expect(hostingSummary({ reviews: [], listings: [], sessions: [] })).toBeNull()
  })

  it('picks the soonest open session and counts only the next 30 days', () => {
    const summary = hostingSummary({
      reviews: [{ rating: 5 }, { rating: 4 }],
      listings,
      sessions: [
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
        {
          listing_id: 'listing-9',
          starts_at: '2026-12-10T02:00:00.000Z',
          status: 'open',
          listings: { title: 'Latte art' },
        },
        {
          listing_id: 'listing-8',
          starts_at: '2026-10-27T02:00:00.000Z',
          status: 'full',
        },
      ],
      now: NOW,
    })

    expect(summary.next).toEqual({
      listingId: 'listing-9',
      title: 'Latte art',
      startsAt: '2026-10-28T02:00:00.000Z',
    })
    expect(summary.openIn30Days).toBe(1)
    expect(summary.listingCount).toBe(2)
    expect(summary.average).toBe(4.5)
    expect(summary.reviewCount).toBe(2)
  })

  it('excludes sessions after 30 days and non-open ones from the 30-day count', () => {
    const summary = hostingSummary({
      reviews: [],
      listings,
      sessions: [
        { listing_id: 'listing-9', starts_at: '2026-10-27T02:00:00.000Z', status: 'held' },
        { listing_id: 'listing-9', starts_at: '2026-10-28T02:00:00.000Z', status: 'full' },
        { listing_id: 'listing-8', starts_at: '2026-12-01T02:00:00.000Z', status: 'open' },
      ],
      now: NOW,
    })

    expect(summary.next).toEqual({
      listingId: 'listing-8',
      title: 'Open mic',
      startsAt: '2026-12-01T02:00:00.000Z',
    })
    expect(summary.openIn30Days).toBe(0)
    expect(summary.average).toBeNull()
    expect(summary.reviewCount).toBe(0)
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
    expect(HOST_OPEN_SESSIONS_SELECT).toBe('id, listing_id, starts_at, status, listings!inner(title)')
    expect(HOST_OPEN_SESSIONS_SELECT).not.toMatch(/review_note|host_reminder|full_address|bookings/)
    expect(builder.eq).toHaveBeenCalledWith('status', 'open')
    expect(builder.gt).toHaveBeenCalledWith('starts_at', '2026-10-26T04:00:00.000Z')
    expect(builder.eq).toHaveBeenCalledWith('listings.host_id', 'host-1')
    expect(builder.eq).toHaveBeenCalledWith('listings.is_active', true)
    expect(builder.eq).toHaveBeenCalledWith('listings.review_status', 'approved')
    expect(builder.order).toHaveBeenCalledWith('starts_at', { ascending: true })
    expect(builder.limit).toHaveBeenCalledWith(HOST_OPEN_SESSIONS_LIMIT)
  })
})
