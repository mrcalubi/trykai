import { describe, expect, it } from 'vitest'
import {
  BROWSE_CATEGORIES,
  LISTING_CATEGORIES,
  listingCategoryAreaLine,
} from './listingCategories'

describe('listingCategories', () => {
  it('lists every host-choosable category after All', () => {
    expect(LISTING_CATEGORIES).toEqual([
      'Food',
      'Fitness',
      'Arts',
      'Music',
      'Language',
      'Other',
    ])
    expect(BROWSE_CATEGORIES).toEqual(['All', ...LISTING_CATEGORIES])
  })

  it('joins category and area without a dangling separator', () => {
    expect(listingCategoryAreaLine('Food', 'Bedok')).toBe('Food · Bedok')
    expect(listingCategoryAreaLine('Food', '')).toBe('Food')
    expect(listingCategoryAreaLine('Food', null)).toBe('Food')
    expect(listingCategoryAreaLine('', 'Bedok')).toBe('Bedok')
  })
})
