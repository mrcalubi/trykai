import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/react'

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

import {
  APP_UPDATED_ERROR,
  HEIC_READ_ERROR,
  convertHeicIfNeeded,
  convertHeicToJpeg,
  heicLoader,
  isHeicFile,
  isHeicReadError,
  isImageFile,
  isStaleChunkError,
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

    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(convertHeicToJpeg(heic)).rejects.toThrow(HEIC_READ_ERROR)
    expect(isHeicReadError(new Error(HEIC_READ_ERROR))).toBe(true)
  })

  it('reports the real conversion failure to Sentry', async () => {
    const heic = new File(['h'], 'shot.heic', { type: 'image/heic' })
    const cause = new Error('Failed to fetch dynamically imported module')
    vi.spyOn(heicLoader, 'importConverter').mockRejectedValue(cause)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(convertHeicToJpeg(heic)).rejects.toThrow(APP_UPDATED_ERROR)
    expect(Sentry.captureException).toHaveBeenCalledWith(
      cause,
      expect.objectContaining({ tags: { area: 'heic-convert' } }),
    )
  })

  it('tells the host to refresh when the converter chunk is gone after a deploy', async () => {
    expect(isStaleChunkError(new Error('Failed to fetch dynamically imported module: /assets/heic2any-abc.js'))).toBe(true)
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isStaleChunkError(new Error('error loading dynamically imported module'))).toBe(true)
    expect(isStaleChunkError(new Error('ERR_LIBHEIF format not supported'))).toBe(false)
    expect(isHeicReadError(new Error(APP_UPDATED_ERROR))).toBe(true)

    const heic = new File(['h'], 'shot.heic', { type: 'image/heic' })
    vi.spyOn(heicLoader, 'importConverter').mockRejectedValue(new Error('ERR_LIBHEIF format not supported'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(convertHeicToJpeg(heic)).rejects.toThrow(HEIC_READ_ERROR)
  })
})
