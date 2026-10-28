import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HEIC_READ_ERROR,
  convertHeicIfNeeded,
  convertHeicToJpeg,
  heicLoader,
  isHeicFile,
  isHeicReadError,
  isImageFile,
} from './heicImage'

describe('heicImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects HEIC by MIME or extension when the type is empty', () => {
    expect(isHeicFile(new File(['h'], 'shot.heic', { type: 'image/heic' }))).toBe(true)
    expect(isHeicFile(new File(['h'], 'shot.heif', { type: 'image/heif' }))).toBe(true)
    expect(isHeicFile(new File(['h'], 'IMG_001.HEIC', { type: '' }))).toBe(true)
    expect(isHeicFile(new File(['j'], 'latte.jpg', { type: 'image/jpeg' }))).toBe(false)
    expect(isImageFile(new File(['h'], 'IMG_001.heif', { type: '' }))).toBe(true)
    expect(isImageFile(new File(['j'], 'latte.jpg', { type: 'image/jpeg' }))).toBe(true)
    expect(isImageFile(new File(['n'], 'notes.txt', { type: 'text/plain' }))).toBe(false)
  })

  it('leaves non-HEIC files untouched without loading the converter', async () => {
    const jpeg = new File(['j'], 'latte.jpg', { type: 'image/jpeg' })
    const load = vi.spyOn(heicLoader, 'importConverter')
    await expect(convertHeicIfNeeded(jpeg)).resolves.toBe(jpeg)
    expect(load).not.toHaveBeenCalled()
  })

  it('wraps a converted blob as a JPEG file', async () => {
    const heic = new File(['h'], 'shot.heic', { type: 'image/heic' })
    vi.spyOn(heicLoader, 'importConverter').mockResolvedValue(async () => new Blob(['jpeg'], { type: 'image/jpeg' }))

    const next = await convertHeicToJpeg(heic)

    expect(next.type).toBe('image/jpeg')
    expect(next.name).toBe('shot.jpg')
    expect(heicLoader.importConverter).toHaveBeenCalledOnce()
  })

  it('throws the shared read error when conversion fails', async () => {
    const heic = new File(['h'], 'shot.heic', { type: 'image/heic' })
    vi.spyOn(heicLoader, 'importConverter').mockRejectedValue(new Error('wasm'))

    await expect(convertHeicToJpeg(heic)).rejects.toThrow(HEIC_READ_ERROR)
    expect(isHeicReadError(new Error(HEIC_READ_ERROR))).toBe(true)
  })
})
