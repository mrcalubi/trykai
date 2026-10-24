import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LISTING_COVER_ASPECT,
  LISTING_COVER_H,
  LISTING_COVER_W,
  cropImageToBlob,
  cropSourceUrl,
  loadImage,
  photoHasOriginal,
  photoIsCropped,
  rememberOriginal,
  revokeIfBlobUrl,
  revokePhotoUrls,
} from './coverCrop'

describe('coverCrop', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('matches the shared CSS cover ratio used on every cover surface', () => {
    expect(LISTING_COVER_W).toBe(4)
    expect(LISTING_COVER_H).toBe(3)
    expect(LISTING_COVER_ASPECT).toBe(4 / 3)
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/--listing-cover-aspect:\s*4 \/ 3/)
    expect(css).toMatch(/\.ui-card__image-wrap \{[\s\S]*?aspect-ratio:\s*var\(--listing-cover-aspect\)/)
    expect(css).toMatch(/\.ui-card--browse \.ui-card__image-wrap \{[\s\S]*?aspect-ratio:\s*var\(--listing-cover-aspect\)/)
    expect(css).toMatch(/\.listing-card__image-wrap \{[\s\S]*?aspect-ratio:\s*var\(--listing-cover-aspect\)/)
    expect(css).toMatch(/\.detail-gallery__photo \{[\s\S]*?aspect-ratio:\s*var\(--listing-cover-aspect\)/)
    expect(css).toMatch(/\.booking-detail__photo \{[\s\S]*?aspect-ratio:\s*var\(--listing-cover-aspect\)/)
    expect(css).toMatch(/\.skeleton-card__media \{[\s\S]*?aspect-ratio:\s*var\(--listing-cover-aspect\)/)
    expect(css).toMatch(/\.hosting-listing__thumb \{[\s\S]*?object-position:\s*center/)
    expect(css).toMatch(/\.checkout-summary__photo \{[\s\S]*?object-position:\s*center/)
    expect(css).toMatch(/\.preview-image \{[\s\S]*?object-position:\s*center/)
  })

  it('draws the chosen pixels onto a canvas and returns a blob', async () => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => {
      done(new Blob(['crop'], { type: 'image/jpeg' }))
    })

    const blob = await cropImageToBlob(
      { width: 800, height: 600 },
      { x: 10, y: 20, width: 400, height: 300 },
    )

    expect(drawImage).toHaveBeenCalled()
    expect(blob.type).toBe('image/jpeg')
  })

  it('rejects when the canvas has no 2d context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(cropImageToBlob({}, { x: 0, y: 0, width: 10, height: 10 })).rejects.toThrow(
      'Canvas is not available',
    )
  })

  it('rejects when encoding fails', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(null))
    await expect(cropImageToBlob({}, { x: 0, y: 0, width: 10, height: 10 })).rejects.toThrow(
      'encode',
    )
  })

  it('resolves when the image loads and rejects when it does not', async () => {
    const OriginalImage = globalThis.Image
    class FakeImage {
      constructor() {
        this.listeners = {}
      }
      addEventListener(type, fn) {
        this.listeners[type] = fn
      }
      set src(value) {
        queueMicrotask(() => {
          if (String(value).includes('bad')) this.listeners.error?.()
          else this.listeners.load?.()
        })
      }
    }
    globalThis.Image = FakeImage

    await expect(loadImage('https://cdn.test/ok.jpg')).resolves.toBeInstanceOf(FakeImage)
    await expect(loadImage('https://cdn.test/bad.jpg')).rejects.toThrow('Could not load the photo')

    globalThis.Image = OriginalImage
  })

  it('keeps a new photo original and crops saved photos from the remote url', () => {
    const file = new File(['a'], 'a.png', { type: 'image/png' })
    const fresh = rememberOriginal({
      id: 'a',
      file,
      previewUrl: 'blob:a',
      remoteUrl: null,
    })
    expect(fresh.originalFile).toBe(file)
    expect(fresh.originalUrl).toBe('blob:a')
    expect(photoHasOriginal(fresh)).toBe(true)
    expect(photoIsCropped(fresh)).toBe(false)
    expect(cropSourceUrl({ ...fresh, previewUrl: 'blob:cropped', cropState: { zoom: 2 } })).toBe('blob:a')
    expect(photoIsCropped({ ...fresh, previewUrl: 'blob:cropped' })).toBe(true)

    const saved = { id: 'b', file: null, previewUrl: 'https://cdn.test/b.jpg', remoteUrl: 'https://cdn.test/b.jpg' }
    expect(rememberOriginal(saved)).toBe(saved)
    expect(photoHasOriginal(saved)).toBe(false)
    expect(photoIsCropped({ ...saved, file: new File(['c'], 'cover.jpg'), previewUrl: 'blob:c' })).toBe(false)
    expect(cropSourceUrl({ ...saved, previewUrl: 'blob:c' })).toBe('https://cdn.test/b.jpg')
  })

  it('revokes blob urls the editor created, not remote urls', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    revokeIfBlobUrl('https://cdn.test/a.jpg')
    revokePhotoUrls({
      previewUrl: 'blob:preview',
      originalUrl: 'blob:original',
    })
    expect(revoke).toHaveBeenCalledWith('blob:preview')
    expect(revoke).toHaveBeenCalledWith('blob:original')
    expect(revoke).not.toHaveBeenCalledWith('https://cdn.test/a.jpg')
  })
})
