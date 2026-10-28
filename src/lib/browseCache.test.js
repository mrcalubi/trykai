import { afterEach, describe, expect, it } from 'vitest'
import {
  BROWSE_CACHE_TTL_MS,
  clearBrowseCache,
  readBrowseCache,
  scrollRestorationKey,
  writeBrowseCache,
  writeBrowseFilters,
} from './browseCache'

afterEach(() => {
  clearBrowseCache()
})

describe('browseCache', () => {
  it('returns a fresh snapshot and drops it after five minutes', () => {
    const now = Date.parse('2026-10-28T04:00:00.000Z')
    writeBrowseCache(
      {
        listings: [{ id: 'l-1' }],
        ratings: { 'l-1': { rating: 5, reviewCount: 2 } },
        keenCounts: { 'l-1': 3 },
        filters: { category: 'Food', region: 'East', area: 'Bedok', quick: 'weekend' },
      },
      now,
    )

    expect(readBrowseCache(now)).toEqual({
      listings: [{ id: 'l-1' }],
      ratings: { 'l-1': { rating: 5, reviewCount: 2 } },
      keenCounts: { 'l-1': 3 },
      filters: { category: 'Food', region: 'East', area: 'Bedok', quick: 'weekend' },
    })
    expect(readBrowseCache(now + BROWSE_CACHE_TTL_MS - 1)).not.toBeNull()
    expect(readBrowseCache(now + BROWSE_CACHE_TTL_MS)).toBeNull()
  })

  it('patches filters on an existing snapshot', () => {
    const now = Date.parse('2026-10-28T04:00:00.000Z')
    writeBrowseCache({ listings: [{ id: 'l-1' }], filters: { category: 'Food' } }, now)
    writeBrowseFilters({ region: 'West', quick: 'budget' }, now + 10)

    expect(readBrowseCache(now + 10).filters).toEqual({
      category: 'Food',
      region: 'West',
      area: '',
      quick: 'budget',
    })
  })
})

describe('scrollRestorationKey', () => {
  it('keys Home and a public profile by pathname so query replace keeps scroll', () => {
    expect(scrollRestorationKey({ pathname: '/', search: '?category=Food', key: 'abc' })).toBe('/')
    expect(scrollRestorationKey({ pathname: '/u/host-1', search: '?tab=hosting', key: 'def' })).toBe(
      '/u/host-1',
    )
  })

  it('keys every other page by location so a new visit starts at the top', () => {
    expect(scrollRestorationKey({ pathname: '/listings/listing-1', key: 'xyz' })).toBe('xyz')
    expect(scrollRestorationKey({ pathname: '/refund-policy', key: 'pol' })).toBe('pol')
  })
})
