import { describe, expect, it } from 'vitest'
import {
  filterNarrows,
  LOCATION_FILTER_MIN_LISTINGS,
  locationLabel,
  showLocationFilter,
  showNewFlags,
  visibleCategories,
} from './browseUi'

const at = (area, extra = {}) => ({ area, category: 'Food', ...extra })

describe('visibleCategories', () => {
  it('keeps All and only listed categories, in the host order', () => {
    expect(visibleCategories([{ category: 'Music' }, { category: 'Food' }, { category: 'Food' }])).toEqual([
      'All',
      'Food',
      'Music',
    ])
  })

  it('keeps the active category so it can be seen and cleared', () => {
    expect(visibleCategories([{ category: 'Food' }], 'Arts')).toEqual(['All', 'Food', 'Arts'])
    expect(visibleCategories(null)).toEqual(['All'])
  })
})

describe('filterNarrows', () => {
  const even = (n) => n % 2 === 0
  it('is true only when some but not all match', () => {
    expect(filterNarrows([1, 2, 3], even)).toBe(true)
    expect(filterNarrows([2, 4], even)).toBe(false)
    expect(filterNarrows([1, 3], even)).toBe(false)
    expect(filterNarrows(undefined, even)).toBe(false)
  })
})

describe('showLocationFilter', () => {
  it(`needs ${LOCATION_FILTER_MIN_LISTINGS} listings across two regions`, () => {
    const east = Array.from({ length: 7 }, () => at('Bedok'))
    expect(showLocationFilter([...east, at('Jurong West')])).toBe(true)
    expect(showLocationFilter([...east, at('Bedok')])).toBe(false)
    expect(showLocationFilter([...east.slice(1), at('Jurong West')])).toBe(false)
    expect(showLocationFilter(undefined)).toBe(false)
  })
})

describe('showNewFlags', () => {
  const now = new Date('2026-10-20T04:00:00Z')
  const fresh = { created_at: '2026-10-18T00:00:00Z' }
  const old = { created_at: '2026-01-01T00:00:00Z' }
  it('shows New only while under half the listings are new', () => {
    expect(showNewFlags([fresh, fresh], now)).toBe(false)
    expect(showNewFlags([fresh, old], now)).toBe(false)
    expect(showNewFlags([fresh, old, old], now)).toBe(true)
    expect(showNewFlags([], now)).toBe(false)
  })
})

describe('locationLabel', () => {
  it('names the area, then the region, else Anywhere', () => {
    expect(locationLabel('East', 'Bedok')).toBe('Bedok')
    expect(locationLabel('East', '')).toBe('East')
    expect(locationLabel('All', '')).toBe('Anywhere')
    expect(locationLabel(undefined, undefined)).toBe('Anywhere')
  })
})
