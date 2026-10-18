import { describe, expect, it } from 'vitest'
import { LISTING_FIELD_HINTS, PHOTO_SKIP_COPY, PHOTO_UPLOAD_ERROR } from './listingFieldHints'

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
