import { describe, expect, it } from 'vitest'
import { movePhoto, photosFromUrls } from './listingPhotos'

describe('listingPhotos', () => {
  it('rebuilds remote photos in the given order', () => {
    expect(photosFromUrls(['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']).map((p) => p.remoteUrl)).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
    ])
  })

  it('moves a photo and leaves others in place', () => {
    const photos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(movePhoto(photos, 2, 0).map((p) => p.id)).toEqual(['c', 'a', 'b'])
    expect(movePhoto(photos, 0, 0)).toBe(photos)
  })
})
