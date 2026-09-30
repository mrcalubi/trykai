import { describe, expect, it } from 'vitest'
import { ratingsByListingId } from './listingRatings'

describe('ratingsByListingId', () => {
  it('keeps average and count for listings that have reviews', () => {
    expect(
      ratingsByListingId([{ listing_id: 'l-1', average: 4.83, review_count: 12 }])
    ).toEqual({ 'l-1': { rating: 4.83, reviewCount: 12 } })
  })

  it('drops rows with no reviews so the card never shows an empty star', () => {
    expect(
      ratingsByListingId([
        { listing_id: 'l-1', average: 0, review_count: 0 },
        { listing_id: 'l-2', average: 5, review_count: 0 },
        { listing_id: null, average: 4, review_count: 3 },
      ])
    ).toEqual({})
  })
})
