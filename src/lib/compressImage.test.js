import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImage } from './compressImage'

function imageFile(name = 'avatar.png') {
  return new File(['binary'], name, { type: 'image/png' })
}

function stubImage({ fail = false, width = 3200, height = 1600 } = {}) {
  const OriginalImage = globalThis.Image
  class FakeImage {
    constructor() {
      this.naturalWidth = width
      this.naturalHeight = height
      this.width = width
      this.height = height
    }
    set src(_value) {
      queueMicrotask(() => {
        if (fail) this.onerror?.(new Event('error'))
        else this.onload?.(new Event('load'))
      })
    }
  }
  globalThis.Image = FakeImage
  return () => {
    globalThis.Image = OriginalImage
  }
}

function stubCanvas({ blob = new Blob(['jpg'], { type: 'image/jpeg' }), ctx = {} } = {}) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    ...ctx,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(blob))
}

describe('compressImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('leaves non-images alone', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    await expect(compressImage(file)).resolves.toBe(file)
  })

  it('returns the original file when the image cannot be read', async () => {
    const file = imageFile()
    const restore = stubImage({ fail: true })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(compressImage(file)).resolves.toBe(file)
    expect(error).toHaveBeenCalled()
    restore()
  })

  it('returns the original file when the canvas has no 2d context', async () => {
    const file = imageFile()
    const restore = stubImage()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(compressImage(file)).resolves.toBe(file)
    restore()
  })

  it('encodes a large image as JPEG and shrinks the long edge', async () => {
    const file = imageFile('latte.png')
    const restore = stubImage({ width: 3200, height: 1600 })
    stubCanvas()

    const next = await compressImage(file)

    expect(next).not.toBe(file)
    expect(next.type).toBe('image/jpeg')
    expect(next.name).toBe('latte.jpg')
    restore()
  })

  it('returns the original file when encoding fails', async () => {
    const file = imageFile()
    const restore = stubImage({ width: 400, height: 300 })
    stubCanvas({ blob: null })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(compressImage(file)).resolves.toBe(file)
    expect(error).toHaveBeenCalled()
    restore()
  })

  it('returns the original file when toBlob is missing', async () => {
    const file = imageFile()
    const restore = stubImage({ width: 400, height: 300 })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
    HTMLCanvasElement.prototype.toBlob = undefined
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(compressImage(file)).resolves.toBe(file)
    expect(error).toHaveBeenCalled()
    restore()
  })

  it('returns the original file when compressImage itself throws', async () => {
    const file = imageFile()
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('csp')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(compressImage(file)).resolves.toBe(file)
    expect(error).toHaveBeenCalled()
  })
})
