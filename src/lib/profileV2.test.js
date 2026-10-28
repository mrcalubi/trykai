import { describe, expect, it } from 'vitest'
import {
  bannerPreset,
  clip,
  comingUpSessions,
  dateChip,
  featuredReview,
  firstRow,
  guestCalendarMarks,
  guestMedals,
  handleError,
  hostAreasLine,
  hostMedals,
  joinMonthLabel,
  medalHint,
  normalizeHandle,
  profileStatsFromRpc,
  reviewerName,
  rpcBoolean,
  shortDay,
  socialUrl,
  splitGuestBookings,
  spotsLine,
  starsText,
} from './profileV2'

const NOW = Date.parse('2026-10-27T04:00:00Z')
const hours = (h) => new Date(NOW + h * 3600e3).toISOString()

describe('banners', () => {
  it('falls back to sand for null or unknown presets', () => {
    expect(bannerPreset(null).id).toBe('sand')
    expect(bannerPreset('pink').id).toBe('sand')
    expect(bannerPreset('coral').bg).toBe('#F6E3D9')
  })
})

describe('socials', () => {
  it('keeps just the handle from links, @ and spaces', () => {
    expect(normalizeHandle('instagram', ' @mei.cooks ')).toBe('mei.cooks')
    expect(normalizeHandle('instagram', 'https://www.instagram.com/mei.cooks/?hl=en')).toBe('mei.cooks')
    expect(normalizeHandle('instagram', 'instagram.com/mei')).toBe('mei')
    expect(normalizeHandle('tiktok', 'https://www.tiktok.com/@meicooks')).toBe('meicooks')
    expect(normalizeHandle('tiktok', '')).toBe('')
    expect(normalizeHandle('tiktok', null)).toBe('')
    expect(normalizeHandle('tiktok', 'https://example.com/x')).toBe('https://example.com/x')
  })

  it('explains a handle the database would refuse', () => {
    expect(handleError('instagram', '')).toBe('')
    expect(handleError('instagram', 'mei.cooks_1')).toBe('')
    expect(handleError('instagram', 'mei cooks')).toMatch(/letters, numbers/)
    expect(handleError('tiktok', 'a')).toMatch(/2 to 24/)
    expect(handleError('instagram', 'x'.repeat(31))).toMatch(/30 at most/)
  })

  it('builds profile links', () => {
    expect(socialUrl('instagram', 'mei')).toBe('https://www.instagram.com/mei/')
    expect(socialUrl('tiktok', 'mei')).toBe('https://www.tiktok.com/@mei')
    expect(socialUrl('tiktok', '')).toBe('')
  })
})

describe('header facts', () => {
  it('lists up to three distinct areas', () => {
    expect(hostAreasLine([])).toBe('')
    expect(hostAreasLine([{ area: 'Bishan' }, { area: 'Bishan' }, { area: ' Toa Payoh ' }])).toBe(
      'Hosts in Bishan, Toa Payoh',
    )
    expect(
      hostAreasLine([{ area: 'A' }, { area: 'B' }, { area: 'C' }, { area: 'D' }, { area: null }]),
    ).toBe('Hosts in A, B, C +1 more')
  })

  it('formats the join month in Singapore time', () => {
    expect(joinMonthLabel('2026-09-30T17:00:00Z')).toBe('October 2026')
    expect(joinMonthLabel(null)).toBe('')
    expect(joinMonthLabel('nope')).toBe('')
  })

  it('reads RPC shapes defensively', () => {
    expect(firstRow([{ a: 1 }])).toEqual({ a: 1 })
    expect(firstRow([])).toBeNull()
    expect(firstRow({ a: 1 })).toEqual({ a: 1 })
    expect(firstRow(5)).toBeNull()
    expect(rpcBoolean(true)).toBe(true)
    expect(rpcBoolean([true])).toBe(true)
    expect(rpcBoolean('true')).toBe(false)
  })

  it('turns my_profile_stats into numbers, or null when unavailable', () => {
    expect(profileStatsFromRpc(null, { message: 'missing' })).toBeNull()
    expect(profileStatsFromRpc([], null)).toBeNull()
    expect(
      profileStatsFromRpc([{ guests_hosted: '4', repeat_guests: null, sessions_attended: -1, joined_at: 'x' }], null),
    ).toEqual({
      guestsHosted: 4,
      repeatGuests: 0,
      sessionsAttended: 0,
      categoriesTried: 0,
      reviewsWritten: 0,
      joinedAt: 'x',
    })
  })
})

describe('reviews', () => {
  const reviews = [
    { id: 'a', rating: 5, created_at: '2026-01-01T00:00:00Z' },
    { id: 'b', rating: 5, created_at: '2026-03-01T00:00:00Z' },
    { id: 'c', rating: 3, created_at: '2026-04-01T00:00:00Z' },
  ]

  it('uses the pick, else the newest 5-star, else nothing', () => {
    expect(featuredReview(reviews, 'c').id).toBe('c')
    expect(featuredReview(reviews, 'gone').id).toBe('b')
    expect(featuredReview(reviews, null).id).toBe('b')
    expect(featuredReview([{ id: 'x', rating: 4 }], null)).toBeNull()
    expect(featuredReview(null, null)).toBeNull()
  })

  it('formats reviewer, stars and clipped text', () => {
    expect(reviewerName({ users: { full_name: ' Sam ' } })).toBe('Sam')
    expect(reviewerName({})).toBe('A guest')
    expect(starsText(4)).toBe('★★★★☆')
    expect(starsText(9)).toBe('★★★★★')
    expect(clip('short')).toBe('short')
    expect(clip('a'.repeat(10), 5)).toBe('aaaa…')
    expect(clip(null)).toBe('')
  })
})

describe('milestones', () => {
  it('earns host medals from sessions held and a 5-star review', () => {
    const none = hostMedals()
    expect(none.every((medal) => !medal.earned)).toBe(true)
    const some = hostMedals({ sessionsHeld: 12, reviews: [{ rating: 5 }] })
    expect(some.map((medal) => medal.earned)).toEqual([true, true, true, false])
  })

  it('earns guest medals, including OG for launch-year joiners', () => {
    const medals = guestMedals({ sessionsAttended: 5, categoriesTried: 3, joinedAt: '2026-10-01T00:00:00Z' })
    expect(medals.map((medal) => medal.earned)).toEqual([true, true, true, true])
    expect(guestMedals({ joinedAt: '2027-02-01T00:00:00Z' })[3].earned).toBe(false)
    expect(guestMedals()[3].earned).toBe(false)
  })

  it('says what to do next', () => {
    expect(medalHint(hostMedals(), 0, { nextSessionLabel: 'Sat, 7 Nov' })).toBe(
      'Host your first session on Sat, 7 Nov to earn your first medal.',
    )
    expect(medalHint(hostMedals(), 0)).toBe('Host your first session to earn your first medal.')
    expect(medalHint(guestMedals(), 0, { host: false })).toBe(
      'Book your first session to earn your first medal.',
    )
    expect(medalHint(hostMedals({ sessionsHeld: 9 }), 9)).toBe('1 more session to unlock 10 sessions.')
    expect(medalHint(hostMedals({ sessionsHeld: 60 }), 60)).toBe('')
  })
})

describe('sessions', () => {
  it('keeps open, bookable sessions in the window, soonest first', () => {
    const rows = [
      { id: 'late', starts_at: hours(24 * 40), status: 'open' },
      { id: 'b', starts_at: hours(48), status: 'open', spots_remaining: 2 },
      { id: 'a', starts_at: hours(24), status: 'open', spots_remaining: null },
      { id: 'full', starts_at: hours(30), status: 'open', spots_remaining: 0 },
      { id: 'past', starts_at: hours(-2), status: 'open' },
      { id: 'cancelled', starts_at: hours(5), status: 'cancelled' },
      { id: 'c', starts_at: hours(50) },
      { id: 'd', starts_at: hours(60) },
    ]
    expect(comingUpSessions(rows, { now: NOW }).map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(comingUpSessions(null, { now: NOW })).toEqual([])
  })

  it('words spots', () => {
    expect(spotsLine(null)).toBe('')
    expect(spotsLine(0)).toBe('')
    expect(spotsLine(1)).toBe('1 spot left')
    expect(spotsLine(3)).toBe('3 spots left')
    expect(spotsLine(4)).toBe('4 spots left')
    expect(spotsLine(6)).toBe('6 spots')
  })

  it('formats chips and short days in Singapore time', () => {
    expect(dateChip('2026-10-27T17:00:00Z')).toEqual({ weekday: 'Wed', day: '28' })
    expect(dateChip('bad')).toEqual({ weekday: '', day: '' })
    expect(shortDay('2026-11-07T04:00:00Z')).toBe('Sat, 7 Nov')
    expect(shortDay('bad')).toBe('')
  })

  it('marks guest days as upcoming or attended', () => {
    const marks = guestCalendarMarks(
      [
        { status: 'confirmed', sessions: { starts_at: hours(24) } },
        { status: 'confirmed', sessions: { starts_at: hours(-24) } },
        { status: 'cancelled', sessions: { starts_at: hours(48) } },
        { status: 'confirmed', sessions: null },
      ],
      NOW,
    )
    expect(Object.values(marks).sort()).toEqual(['booked', 'past'])
  })

  it('splits guest bookings into upcoming and past', () => {
    const { upcoming, past } = splitGuestBookings(
      [
        { id: 'later', status: 'confirmed', sessions: { starts_at: hours(48) } },
        { id: 'soon', status: 'confirmed', sessions: { starts_at: hours(2) } },
        { id: 'cancelled', status: 'cancelled', sessions: { starts_at: hours(5) } },
        { id: 'old', status: 'confirmed', sessions: { starts_at: hours(-48) } },
        { id: 'tbc', status: 'confirmed', sessions: null },
      ],
      NOW,
    )
    expect(upcoming.map((row) => row.id)).toEqual(['soon', 'later'])
    expect(past.map((row) => row.id)).toEqual(['cancelled', 'old', 'tbc'])
  })
})
