import { afterEach, describe, expect, it, vi } from 'vitest'
import { LISTING_COVER_ASPECT, cropImageToBlob, loadImage } from './coverCrop'

describe('coverCrop', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('matches the browse card image ratio', () => {
    expect(LISTING_COVER_ASPECT).toBe(4 / 3)
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
})
