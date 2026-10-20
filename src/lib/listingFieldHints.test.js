import { describe, expect, it } from 'vitest'
import {
  LISTING_FIELD_HINTS,
  LISTING_SAVE_ERROR,
  PHOTO_SKIP_COPY,
  PHOTO_UPLOAD_ERROR,
  listingSaveProblem,
} from './listingFieldHints'

describe('listing field hints', () => {
  it('uses the agreed title, description and skip copy', () => {
    expect(LISTING_FIELD_HINTS.title).toBe(
      "Give your session a name. Something like 'Latte art for beginners' works great.",
    )
    expect(LISTING_FIELD_HINTS.description).toBe(
      "Tell guests what they'll do. Even two or three sentences is plenty.",
    )
    expect(PHOTO_SKIP_COPY).toBe(
      'Your skill deserves to be seen! Listings with photos get far more bookings.',
    )
    expect(PHOTO_UPLOAD_ERROR).toBe(
      "That photo didn't upload. Try again or pick a different one.",
    )
  })
})

describe('listingSaveProblem', () => {
  it('points a price constraint at the price field', () => {
    for (const name of ['listings_price_ceiling', 'listings_price_nonneg']) {
      expect(
        listingSaveProblem({ message: `new row for relation "listings" violates check constraint "${name}"` }),
      ).toEqual({ field: 'price', hint: LISTING_FIELD_HINTS.price, message: 'Check the price above.' })
    }
  })

  it('swaps other database wording for one plain message', () => {
    expect(listingSaveProblem({ message: 'null value in column "title" violates not-null constraint' })).toEqual({
      message: LISTING_SAVE_ERROR,
    })
    expect(listingSaveProblem({ message: 'permission denied for table listings' })).toEqual({
      message: LISTING_SAVE_ERROR,
    })
    expect(listingSaveProblem(null)).toEqual({ message: LISTING_SAVE_ERROR })
  })

  it('keeps messages our own functions raise, which are written for hosts', () => {
    expect(listingSaveProblem({ message: 'Spots per session must be at least 1.' })).toEqual({
      message: 'Spots per session must be at least 1.',
    })
  })
})
