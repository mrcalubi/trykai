import { describe, expect, it } from 'vitest'
import {
  hasSessionThisWeekend,
  isBudgetFriendly,
  isRecentlyListed,
  nextSessionLabel,
  weekendDateKeys,
} from './browseFilters'

// Wednesday 21 October 2026, noon in Singapore.
const WEDNESDAY = new Date('2026-10-21T04:00:00.000Z')
// Saturday 24 October 2026, noon in Singapore.
const SATURDAY = new Date('2026-10-24T04:00:00.000Z')
// Sunday 25 October 2026, noon in Singapore.
const SUNDAY = new Date('2026-10-25T04:00:00.000Z')

function listingWith(...startsAt) {
  return { sessions: startsAt.map((starts_at) => ({ starts_at, status: 'open' })) }
}

describe('weekendDateKeys', () => {
  it('looks ahead to the coming Saturday and Sunday on a weekday', () => {
    expect([...weekendDateKeys(WEDNESDAY)]).toEqual(['2026-10-24', '2026-10-25'])
  })

  it('keeps today and tomorrow on a Saturday', () => {
    expect([...weekendDateKeys(SATURDAY)]).toEqual(['2026-10-24', '2026-10-25'])
  })

  it('keeps only today on a Sunday', () => {
    expect([...weekendDateKeys(SUNDAY)]).toEqual(['2026-10-25'])
  })
})

describe('hasSessionThisWeekend', () => {
  it('matches a session on Saturday in Singapore time', () => {
    expect(hasSessionThisWeekend(listingWith('2026-10-24T02:00:00.000Z'), WEDNESDAY)).toBe(true)
  })

  it('uses the Singapore day, not the UTC day', () => {
    // 01:00 on Sunday in Singapore is still Saturday in UTC.
    expect(hasSessionThisWeekend(listingWith('2026-10-24T17:00:00.000Z'), WEDNESDAY)).toBe(true)
    // 07:00 on Saturday in Singapore is Friday 23:00 UTC.
    expect(hasSessionThisWeekend(listingWith('2026-10-23T23:00:00.000Z'), WEDNESDAY)).toBe(true)
  })

  it('ignores weekday sessions and the following weekend', () => {
    expect(
      hasSessionThisWeekend(
        listingWith('2026-10-26T01:00:00.000Z', '2026-10-31T02:00:00.000Z'),
        WEDNESDAY
      )
    ).toBe(false)
  })

  it('handles a listing with no sessions', () => {
    expect(hasSessionThisWeekend({}, WEDNESDAY)).toBe(false)
  })
})

describe('isBudgetFriendly', () => {
  it('compares the all-in guest price, not the lesson price', () => {
    expect(isBudgetFriendly({ price_per_person: 2500 })).toBe(true)
    // $30 of lesson is more than $30 once card fees are added.
    expect(isBudgetFriendly({ price_per_person: 3000 })).toBe(false)
  })

  it('never treats a missing price as cheap', () => {
    expect(isBudgetFriendly({ price_per_person: null })).toBe(false)
  })
})

describe('nextSessionLabel', () => {
  it('names the soonest session still to come', () => {
    const listing = listingWith(
      '2026-10-31T02:00:00.000Z',
      '2026-10-20T02:00:00.000Z',
      '2026-10-24T02:00:00.000Z'
    )
    expect(nextSessionLabel(listing, WEDNESDAY)).toBe('Sat, 24 Oct')
  })

  it('is empty without an upcoming session', () => {
    expect(nextSessionLabel(listingWith('2026-10-20T02:00:00.000Z'), WEDNESDAY)).toBe('')
  })
})

describe('isRecentlyListed', () => {
  it('is true for 30 days after the listing went live', () => {
    expect(isRecentlyListed({ created_at: '2026-10-01T00:00:00.000Z' }, WEDNESDAY)).toBe(true)
    expect(isRecentlyListed({ created_at: '2026-09-01T00:00:00.000Z' }, WEDNESDAY)).toBe(false)
  })

  it('is false when the date is unknown', () => {
    expect(isRecentlyListed({}, WEDNESDAY)).toBe(false)
  })
})
