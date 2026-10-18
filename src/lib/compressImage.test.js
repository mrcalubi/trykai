import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImage } from './compressImage'

function imageFile(name = 'avatar.png') {
  return new File(['binary'], name, { type: 'image/png' })
}

function stubCanvas({ webp = true, blob = new Blob(['ok'], { type: 'image/webp' }), ctx = {} } = {}) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    ...ctx,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation((type) =>
    webp && type === 'image/webp' ? 'data:image/webp;base64,xx' : 'data:image/jpeg;base64,xx',
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(blob))
}

describe('compressImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the original file when the browser cannot draw it', async () => {
    const file = imageFile()
    vi.stubGlobal('createImageBitmap', undefined)
    await expect(compressImage(file)).resolves.toBe(file)
  })

  it('leaves non-images alone', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    await expect(compressImage(file)).resolves.toBe(file)
  })

  it('returns the original file when createImageBitmap throws', async () => {
    const file = imageFile()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      throw new Error('decode')
    }))
    await expect(compressImage(file)).resolves.toBe(file)
  })

  it('returns the original file when the canvas has no 2d context', async () => {
    const file = imageFile()
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close })),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(compressImage(file)).resolves.toBe(file)
    expect(close).toHaveBeenCalled()
  })

  it('encodes a large image as WebP and shrinks the long edge', async () => {
    const file = imageFile('latte.png')
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 3200, height: 1600, close })),
    )
    stubCanvas({ webp: true, blob: new Blob(['webp'], { type: 'image/webp' }) })

    const next = await compressImage(file)

    expect(next).not.toBe(file)
    expect(next.type).toBe('image/webp')
    expect(next.name).toBe('latte.webp')
    expect(close).toHaveBeenCalled()
  })

  it('falls back to JPEG when WebP is not supported', async () => {
    const file = new File(['binary'], 'photo', { type: 'image/jpeg' })
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 400, height: 300 })),
    )
    stubCanvas({ webp: false, blob: new Blob(['jpg'], { type: 'image/jpeg' }) })

    const next = await compressImage(file)
    expect(next.type).toBe('image/jpeg')
    expect(next.name).toBe('photo.jpg')
  })

  it('returns the original file when encoding fails', async () => {
    const file = imageFile()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 400, height: 300 })),
    )
    stubCanvas({ blob: null })
    await expect(compressImage(file)).resolves.toBe(file)
  })

  it('returns the original file when toBlob is missing', async () => {
    const file = imageFile()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 400, height: 300 })),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,xx')
    HTMLCanvasElement.prototype.toBlob = undefined
    await expect(compressImage(file)).resolves.toBe(file)
  })
})
