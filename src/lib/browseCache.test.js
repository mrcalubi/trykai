import { afterEach, describe, expect, it } from 'vitest'
import {
  BROWSE_CACHE_TTL_MS,
  clearBrowseCache,
  readBrowseCache,
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
