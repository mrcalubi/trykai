import { describe, expect, it } from 'vitest'
import {
  groupSizeRange,
  HOST_INTEREST_EMAIL_GAP_MS,
  interestDecision,
  interestTallies,
  keenBadge,
  keenPeopleLine,
  parseInterestRequest,
  shouldEmailHost,
  summarizeInterest,
} from './interest.ts'

const ID = '0b6c2f1e-8d1a-4f43-9a7e-2c5d8e9f1a2b'

describe('parseInterestRequest', () => {
  it('accepts a tap with no choices as any time, solo', () => {
    expect(parseInterestRequest({ listing_id: ID })).toEqual({
      ok: true,
      value: { listingId: ID, days: [], times: [], groupSize: 1 },
    })
  })

  it('keeps the canonical order and drops repeats', () => {
    const parsed = parseInterestRequest({
      listing_id: ID,
      days: ['weekend', 'weekday', 'weekend'],
      times: ['evening', 'morning'],
      group_size: 3,
    })
    expect(parsed).toEqual({
      ok: true,
      value: { listingId: ID, days: ['weekday', 'weekend'], times: ['morning', 'evening'], groupSize: 3 },
    })
  })

  it.each([
    [null, 'Invalid request'],
    [{ listing_id: 'abc' }, 'listing_id is required'],
    [{ listing_id: ID, days: ['monday'] }, 'Unknown day choice'],
    [{ listing_id: ID, days: 'weekday' }, 'Unknown day choice'],
    [{ listing_id: ID, times: ['night'] }, 'Unknown time choice'],
    [{ listing_id: ID, group_size: 0 }, 'Group size must be 1 to 10'],
    [{ listing_id: ID, group_size: 11 }, 'Group size must be 1 to 10'],
    [{ listing_id: ID, group_size: 2.5 }, 'Group size must be 1 to 10'],
  ])('rejects %j', (body, error) => {
    expect(parseInterestRequest(body)).toEqual({ ok: false, error })
  })

  it('treats null choices as none', () => {
    expect(parseInterestRequest({ listing_id: ID, days: null, times: null })).toMatchObject({
      ok: true,
      value: { days: [], times: [] },
    })
  })
})

describe('interestDecision', () => {
  const listing = { host_id: 'host-1', is_active: true }

  it('needs a signed-in guest', () => {
    expect(interestDecision({ callerId: null, listing, hostSuspended: false })).toMatchObject({ httpStatus: 401 })
  })

  it('hides inactive listings and suspended hosts as not found', () => {
    expect(interestDecision({ callerId: 'g', listing: null, hostSuspended: false })).toMatchObject({ httpStatus: 404 })
    expect(
      interestDecision({ callerId: 'g', listing: { ...listing, is_active: false }, hostSuspended: false }),
    ).toMatchObject({ httpStatus: 404 })
    expect(interestDecision({ callerId: 'g', listing, hostSuspended: true })).toMatchObject({ httpStatus: 404 })
  })

  it('refuses the host on their own listing', () => {
    expect(interestDecision({ callerId: 'host-1', listing, hostSuspended: false })).toMatchObject({ httpStatus: 400 })
  })

  it('allows a guest', () => {
    expect(interestDecision({ callerId: 'g', listing, hostSuspended: false })).toEqual({ ok: true })
  })
})

describe('shouldEmailHost', () => {
  const now = Date.parse('2026-10-20T04:00:00Z')

  it('emails the first time and after a day', () => {
    expect(shouldEmailHost(null, now)).toBe(true)
    expect(shouldEmailHost('not a date', now)).toBe(true)
    expect(shouldEmailHost(new Date(now - HOST_INTEREST_EMAIL_GAP_MS).toISOString(), now)).toBe(true)
  })

  it('waits within the day', () => {
    expect(shouldEmailHost(new Date(now - 60 * 60 * 1000).toISOString(), now)).toBe(false)
  })
})

describe('summaries', () => {
  const rows = [
    { days: ['weekend'], times: ['evening'], group_size: 2 },
    { days: ['weekday', 'weekend'], times: ['evening', 'morning'], group_size: 1 },
    { days: [], times: [], group_size: 4 },
  ]

  it('counts each pick and the group range', () => {
    expect(summarizeInterest(rows)).toEqual({
      keen_count: 3,
      weekday: 1,
      weekend: 2,
      morning: 1,
      afternoon: 0,
      evening: 2,
      min_group: 1,
      max_group: 4,
    })
  })

  it('writes tallies busiest first and skips zeros', () => {
    expect(interestTallies(summarizeInterest(rows))).toEqual({
      days: 'Weekends 2 · Weekdays 1',
      times: 'Evening 2 · Morning 1',
    })
    expect(interestTallies(summarizeInterest([{ days: [], times: [] }]))).toEqual({ days: '', times: '' })
  })

  it('describes group sizes', () => {
    expect(groupSizeRange(summarizeInterest(rows))).toBe('Groups of 1 to 4')
    expect(groupSizeRange(summarizeInterest([{ group_size: 3 }, { group_size: 3 }]))).toBe('Groups of 3')
    expect(groupSizeRange(summarizeInterest([{ group_size: 1 }]))).toBe('Solo')
    expect(groupSizeRange(summarizeInterest([]))).toBe('')
    expect(groupSizeRange(summarizeInterest([{ group_size: null }]))).toBe('')
  })
})

describe('copy', () => {
  it('says someone or N people', () => {
    expect(keenPeopleLine(1)).toBe('Someone is keen')
    expect(keenPeopleLine(3)).toBe('3 people are keen')
    expect(keenPeopleLine(Number.NaN)).toBe('0 people are keen')
  })

  it('shows a badge only from 2', () => {
    expect(keenBadge(0)).toBe('')
    expect(keenBadge(1)).toBe('')
    expect(keenBadge(2)).toBe('2 keen')
    expect(keenBadge(undefined)).toBe('')
  })
})
