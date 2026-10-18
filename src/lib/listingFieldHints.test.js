import { describe, expect, it } from 'vitest'
import { LISTING_FIELD_HINTS, PHOTO_SKIP_COPY } from './listingFieldHints'

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
  })
})
