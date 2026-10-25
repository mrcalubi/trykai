import { describe, expect, it, vi } from 'vitest'
import { filesToPhotos, movePhoto, photosFromUrls, snapshotImageFiles, uploadListingPhotos } from './listingPhotos'

vi.mock('./compressImage', () => ({
  compressImage: vi.fn(async (file) => file),
}))

import { compressImage } from './compressImage'

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

  it('copies a live FileList before the input is cleared', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const live = {
      0: file,
      length: 1,
      *[Symbol.iterator]() {
        for (let i = 0; i < this.length; i += 1) yield this[i]
      },
    }
    const copied = snapshotImageFiles(live)
    live.length = 0
    delete live[0]
    expect(copied).toEqual([file])
  })

  it('uses the original file when compression throws', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    compressImage.mockRejectedValueOnce(new Error('eval blocked'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const photos = await filesToPhotos([file], 5)

    expect(photos).toHaveLength(1)
    expect(photos[0].file).toBe(file)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('reports upload progress for each new file', async () => {
    const onProgress = vi.fn()
    const upload = vi.fn(async () => ({ error: null }))
    const storage = {
      from: () => ({
        upload,
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    }

    await uploadListingPhotos(
      [
        { file: new File(['a'], 'a.png', { type: 'image/png' }) },
        { remoteUrl: 'https://cdn.test/old.jpg' },
        { file: new File(['b'], 'b.png', { type: 'image/png' }) },
      ],
      'host-1',
      storage,
      { onProgress }
    )

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, { index: 1, total: 2 })
    expect(onProgress).toHaveBeenNthCalledWith(2, { index: 2, total: 2 })
  })
})
