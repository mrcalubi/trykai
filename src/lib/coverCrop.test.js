import { describe, expect, it } from 'vitest'
import { LISTING_COVER_ASPECT } from './coverCrop'

describe('coverCrop', () => {
  it('matches the browse card image ratio', () => {
    expect(LISTING_COVER_ASPECT).toBe(4 / 3)
  })
})
