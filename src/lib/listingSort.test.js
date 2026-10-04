import { describe, expect, it } from 'vitest'
import { sortListingsForBrowse } from './listingSort'
import { makeListing, makeSession } from '../test/fixtures'

// 10:00 on Mon 5 Oct 2026 in Singapore.
const NOW = new Date('2026-10-05T02:00:00.000Z')

function listingWithSessions(id, startTimes, sessionOverrides = {}) {
  return makeListing({
    id,
    title: id,
    sessions: startTimes.map((starts_at, index) =>
      makeSession({ id: `${id}-s${index}`, listing_id: id, starts_at, ...sessionOverrides })
    ),
  })
}

function ids(listings) {
  return listings.map((listing) => listing.id)
}

describe('sortListingsForBrowse', () => {
  it('puts the listing with the soonest session date first', () => {
    const nextWeek = listingWithSessions('next-week', ['2026-10-12T02:00:00.000Z'])
    const tomorrow = listingWithSessions('tomorrow', ['2026-10-06T02:00:00.000Z'])
    const inThreeDays = listingWithSessions('in-three-days', ['2026-10-08T02:00:00.000Z'])

    expect(ids(sortListingsForBrowse([nextWeek, tomorrow, inThreeDays], NOW))).toEqual([
      'tomorrow',
      'in-three-days',
      'next-week',
    ])
  })

  it('uses the soonest session of each listing, whatever order the sessions arrive in', () => {
    const later = listingWithSessions('later', ['2026-10-07T02:00:00.000Z'])
    const mixed = listingWithSessions('mixed', [
      '2026-10-20T02:00:00.000Z',
      '2026-10-06T02:00:00.000Z',
    ])

    expect(ids(sortListingsForBrowse([later, mixed], NOW))).toEqual(['mixed', 'later'])
  })

  it('breaks a same-day tie by the total number of upcoming sessions', () => {
    const morningFew = listingWithSessions('morning-few', [
      '2026-10-06T02:00:00.000Z',
      '2026-10-13T02:00:00.000Z',
    ])
    const eveningMany = listingWithSessions('evening-many', [
      '2026-10-06T11:00:00.000Z',
      '2026-10-13T11:00:00.000Z',
      '2026-10-20T11:00:00.000Z',
      '2026-10-27T11:00:00.000Z',
    ])

    expect(ids(sortListingsForBrowse([morningFew, eveningMany], NOW))).toEqual([
      'evening-many',
      'morning-few',
    ])
  })

  it('compares dates by the Singapore calendar day, not the UTC one', () => {
    // 17:00 UTC on 6 Oct is 01:00 on 7 Oct in Singapore.
    const earlyHoursOfSeventh = listingWithSessions('sg-7th', [
      '2026-10-06T17:00:00.000Z',
      '2026-10-08T02:00:00.000Z',
      '2026-10-09T02:00:00.000Z',
    ])
    const sixth = listingWithSessions('sg-6th', ['2026-10-06T03:00:00.000Z'])

    expect(ids(sortListingsForBrowse([earlyHoursOfSeventh, sixth], NOW))).toEqual([
      'sg-6th',
      'sg-7th',
    ])
  })

  it('ignores sessions that have already started or are not open', () => {
    const pastOnly = listingWithSessions('past-only', ['2026-10-05T01:00:00.000Z'])
    const fullTomorrow = listingWithSessions('full-tomorrow', ['2026-10-06T02:00:00.000Z'], {
      status: 'full',
    })
    const openNextWeek = listingWithSessions('open-next-week', ['2026-10-12T02:00:00.000Z'])

    expect(ids(sortListingsForBrowse([pastOnly, fullTomorrow, openNextWeek], NOW))).toEqual([
      'open-next-week',
      'past-only',
      'full-tomorrow',
    ])
  })

  it('does not count started or closed sessions towards the tie-break', () => {
    const withExtras = makeListing({
      id: 'with-extras',
      sessions: [
        makeSession({ starts_at: '2026-10-06T02:00:00.000Z' }),
        makeSession({ starts_at: '2026-10-04T02:00:00.000Z' }),
        makeSession({ starts_at: '2026-10-03T02:00:00.000Z' }),
        makeSession({ starts_at: '2026-10-10T02:00:00.000Z', status: 'full' }),
        makeSession({ starts_at: 'not a date' }),
      ],
    })
    const twoOpen = listingWithSessions('two-open', [
      '2026-10-06T05:00:00.000Z',
      '2026-10-09T05:00:00.000Z',
    ])

    expect(ids(sortListingsForBrowse([withExtras, twoOpen], NOW))).toEqual([
      'two-open',
      'with-extras',
    ])
  })

  it('puts listings with no upcoming sessions last, keeping their incoming order', () => {
    const newestNoSessions = makeListing({ id: 'newest', sessions: [] })
    const missingSessions = makeListing({ id: 'missing' })
    const nullSessions = makeListing({ id: 'null', sessions: null })
    const scheduled = listingWithSessions('scheduled', ['2026-10-30T02:00:00.000Z'])

    expect(
      ids(sortListingsForBrowse([newestNoSessions, missingSessions, scheduled, nullSessions], NOW))
    ).toEqual(['scheduled', 'newest', 'missing', 'null'])
  })

  it('keeps the incoming order when date and session count both tie', () => {
    const first = listingWithSessions('first', ['2026-10-06T09:00:00.000Z'])
    const second = listingWithSessions('second', ['2026-10-06T02:00:00.000Z'])

    expect(ids(sortListingsForBrowse([first, second], NOW))).toEqual(['first', 'second'])
  })

  it('returns a new array and leaves the input untouched', () => {
    const later = listingWithSessions('later', ['2026-10-12T02:00:00.000Z'])
    const sooner = listingWithSessions('sooner', ['2026-10-06T02:00:00.000Z'])
    const input = [later, sooner]

    const sorted = sortListingsForBrowse(input, NOW)

    expect(sorted).not.toBe(input)
    expect(ids(input)).toEqual(['later', 'sooner'])
    expect(sorted[0]).toBe(sooner)
  })

  it('measures upcoming against the current time by default', () => {
    const farFuture = listingWithSessions('far-future', ['2999-01-01T00:00:00.000Z'])
    const past = listingWithSessions('past', ['2000-01-01T00:00:00.000Z'])

    expect(ids(sortListingsForBrowse([past, farFuture]))).toEqual(['far-future', 'past'])
  })
})
