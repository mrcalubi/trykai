import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_REVIEW_PHOTOS,
  REVIEW_PHOTO_CONSENT,
  REVIEW_PHOTO_MAX_BYTES,
  REVIEW_PHOTO_TOO_LARGE,
  REVIEW_PHOTOS_BUCKET,
  compressReviewPhoto,
  filesToReviewPhotos,
  reviewPhotoPublicUrl,
  reviewPhotoUploadError,
  uploadReviewPhotos,
} from './reviewPhotos'
import { HEIC_READ_ERROR, HEIC_UPDATED_ERROR } from './heicImage'

vi.mock('./compressImage', () => ({
  compressImage: vi.fn(async () => new File(['jpg'], 'shot.jpg', { type: 'image/jpeg' })),
}))

import { compressImage } from './compressImage'

function jpeg(name = 'a.jpg') {
  return new File(['jpeg'], name, { type: 'image/jpeg' })
}

describe('reviewPhotos', () => {
  afterEach(() => {
    compressImage.mockReset()
    compressImage.mockImplementation(
      async (file) => new File(['jpg'], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }),
    )
  })

  it('caps guests at three photos and names the public bucket', () => {
    expect(MAX_REVIEW_PHOTOS).toBe(3)
    expect(REVIEW_PHOTO_MAX_BYTES).toBe(3 * 1024 * 1024)
    expect(REVIEW_PHOTOS_BUCKET).toBe('review-photos')
    expect(REVIEW_PHOTO_CONSENT).toMatch(/Add up to 3 photos of what you made/)
  })

  it('builds a public URL from an object path', () => {
    const storage = {
      from: vi.fn(() => ({
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/review-photos/${path}` } }),
      })),
    }
    expect(reviewPhotoPublicUrl('user-1/shot.jpg', storage)).toBe(
      'https://cdn.test/review-photos/user-1/shot.jpg',
    )
    expect(reviewPhotoPublicUrl('', storage)).toBe('')
  })

  it('never keeps the original file after compression', async () => {
    const original = jpeg()
    const compressed = new File(['jpg'], 'shot.jpg', { type: 'image/jpeg' })
    compressImage.mockResolvedValueOnce(compressed)
    await expect(compressReviewPhoto(original)).resolves.toBe(compressed)
    expect(compressImage).toHaveBeenCalledWith(original, { strict: true })
  })

  it('rejects when compression falls back to the original file', async () => {
    const original = jpeg()
    compressImage.mockResolvedValueOnce(original)
    await expect(compressReviewPhoto(original)).rejects.toThrow(HEIC_READ_ERROR)
  })

  it('rejects a file that is still over 3 MB after compression', async () => {
    const huge = new File([new Uint8Array(REVIEW_PHOTO_MAX_BYTES + 1)], 'shot.jpg', {
      type: 'image/jpeg',
    })
    compressImage.mockResolvedValueOnce(huge)
    await expect(compressReviewPhoto(jpeg())).rejects.toThrow(REVIEW_PHOTO_TOO_LARGE)
  })

  it('keeps a JPEG when a sibling HEIC cannot be read', async () => {
    const jpegFile = jpeg()
    const heic = new File(['h'], 'b.heic', { type: 'image/heic' })
    compressImage.mockImplementation(async (file) => {
      if (file.name.endsWith('.heic')) throw new Error(HEIC_READ_ERROR)
      return new File(['jpg'], 'a.jpg', { type: 'image/jpeg' })
    })

    const { photos, errors } = await filesToReviewPhotos([jpegFile, heic], 3)

    expect(photos).toHaveLength(1)
    expect(errors).toEqual([{ name: 'b.heic', message: HEIC_READ_ERROR }])
  })

  it('surfaces the deploy-refresh line when the HEIC converter chunk is missing', async () => {
    const heic = new File(['h'], 'shot.heic', { type: 'image/heic' })
    compressImage.mockRejectedValueOnce(new Error(HEIC_UPDATED_ERROR))
    const { photos, errors } = await filesToReviewPhotos([heic], 3)
    expect(photos).toHaveLength(0)
    expect(errors[0].message).toBe(HEIC_UPDATED_ERROR)
  })

  it('caps the picker at the remaining slots', async () => {
    const { photos } = await filesToReviewPhotos([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')], 2)
    expect(photos).toHaveLength(2)
  })

  it('uploads compressed JPEGs with upsert false and a random name', async () => {
    const upload = vi.fn(async () => ({ error: null }))
    const storage = {
      from: vi.fn(() => ({ upload })),
    }
    const photos = [{ file: new File(['jpg'], 'shot.jpg', { type: 'image/jpeg' }), name: 'shot.jpg' }]

    const paths = await uploadReviewPhotos(photos, 'user-1', storage)

    expect(storage.from).toHaveBeenCalledWith('review-photos')
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/[0-9a-f-]+\.jpg$/i),
      photos[0].file,
      { upsert: false, contentType: 'image/jpeg' },
    )
    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatch(/^user-1\/[0-9a-f-]+\.jpg$/i)
  })

  it('names the photo that failed to upload', async () => {
    const upload = vi.fn(async () => ({ error: { message: 'denied' } }))
    const storage = { from: () => ({ upload }) }
    await expect(
      uploadReviewPhotos(
        [{ file: new File(['jpg'], 'shot.jpg', { type: 'image/jpeg' }), name: 'latte.heic' }],
        'user-1',
        storage,
      ),
    ).rejects.toThrow(reviewPhotoUploadError(0, 'latte.heic'))
  })
})
