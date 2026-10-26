import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImage } from './compressImage'
import { HEIC_READ_ERROR, heicLoader } from './heicImage'

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
  if (typeof HTMLCanvasElement.prototype.toBlob !== 'function') {
    HTMLCanvasElement.prototype.toBlob = function toBlob() {}
  }
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

  it('encodes a large image as JPEG 0.82 and shrinks the long edge to 1600', async () => {
    const file = imageFile('latte.png')
    const restore = stubImage({ width: 4032, height: 3024 })
    stubCanvas()

    const next = await compressImage(file)

    expect(next).not.toBe(file)
    expect(next.type).toBe('image/jpeg')
    expect(next.name).toBe('latte.jpg')
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      0.82,
    )
    expect(HTMLCanvasElement.prototype.toBlob.mock.instances[0].width).toBe(1600)
    expect(HTMLCanvasElement.prototype.toBlob.mock.instances[0].height).toBe(1200)
    restore()
  })

  it('uses createImageBitmap on the main thread when it is available', async () => {
    const file = imageFile('phone.png')
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 4032,
        height: 3024,
        close,
      })),
    )
    stubCanvas()

    const next = await compressImage(file)

    expect(createImageBitmap).toHaveBeenCalledWith(file)
    expect(next.type).toBe('image/jpeg')
    expect(HTMLCanvasElement.prototype.toBlob.mock.instances[0].width).toBe(1600)
    expect(close).toHaveBeenCalled()
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

  it('does not import the HEIC converter for a JPEG', async () => {
    const file = new File(['binary'], 'latte.jpg', { type: 'image/jpeg' })
    const restore = stubImage({ width: 400, height: 300 })
    stubCanvas()
    const load = vi.spyOn(heicLoader, 'importConverter')

    await compressImage(file)

    expect(load).not.toHaveBeenCalled()
    restore()
  })

  it('converts HEIC to JPEG before resize', async () => {
    const heic = new File(['heic'], 'shot.heic', { type: 'image/heic' })
    const converted = new File(['jpeg-bytes'], 'shot.jpg', { type: 'image/jpeg' })
    vi.spyOn(heicLoader, 'importConverter').mockResolvedValue(async () => converted)
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 4032,
        height: 3024,
        close,
      })),
    )
    stubCanvas()

    const next = await compressImage(heic)

    expect(heicLoader.importConverter).toHaveBeenCalledOnce()
    expect(createImageBitmap).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/jpeg', name: 'shot.jpg' }))
    expect(next.type).toBe('image/jpeg')
    expect(next.name).toBe('shot.jpg')
    expect(HTMLCanvasElement.prototype.toBlob.mock.instances[0].width).toBe(1600)
  })

  it('treats a typeless .heic file as HEIC', async () => {
    const heic = new File(['heic'], 'IMG_001.HEIC', { type: '' })
    vi.spyOn(heicLoader, 'importConverter').mockResolvedValue(async () => new Blob(['jpeg'], { type: 'image/jpeg' }))
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 800,
        height: 600,
        close: vi.fn(),
      })),
    )
    stubCanvas()

    const next = await compressImage(heic)

    expect(heicLoader.importConverter).toHaveBeenCalledOnce()
    expect(next.type).toBe('image/jpeg')
    expect(next.name).toBe('IMG_001.jpg')
  })

  it('throws and does not return the HEIC when conversion fails', async () => {
    const heic = new File(['heic'], 'shot.heic', { type: 'image/heic' })
    vi.spyOn(heicLoader, 'importConverter').mockRejectedValue(new Error('wasm'))

    await expect(compressImage(heic)).rejects.toThrow(HEIC_READ_ERROR)
  })

  it('does not fall back to the raw HEIC when resize fails after conversion', async () => {
    const heic = new File(['heic'], 'shot.heic', { type: 'image/heic' })
    vi.spyOn(heicLoader, 'importConverter').mockResolvedValue(async () => new Blob(['jpeg'], { type: 'image/jpeg' }))
    const restore = stubImage({ fail: true })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const next = await compressImage(heic)

    expect(next).not.toBe(heic)
    expect(next.type).toBe('image/jpeg')
    expect(next.name).toBe('shot.jpg')
    expect(error).toHaveBeenCalled()
    restore()
  })
})
