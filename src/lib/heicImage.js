import * as Sentry from '@sentry/react'

export const HEIC_READ_ERROR = "We couldn't read that photo. Try a JPEG or PNG."

/** iOS and desktop pickers: `image/*` plus explicit HEIC so Chrome still offers it. */
export const IMAGE_ACCEPT = 'image/*,image/heic,image/heif,.heic,.heif'

const HEIC_TYPES = new Set(['image/heic', 'image/heif'])

export function isHeicFile(file) {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  if (HEIC_TYPES.has(type)) return true
  const name = String(file.name || '').toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

export function isImageFile(file) {
  if (!file) return false
  if (isHeicFile(file)) return true
  return String(file.type || '').startsWith('image/')
}

export function isHeicReadError(error) {
  return Boolean(error && error.message === HEIC_READ_ERROR)
}

/** Object so tests can spy without ESM live-binding issues. */
export const heicLoader = {
  async importConverter() {
    const mod = await import('heic2any')
    return mod.default ?? mod
  },
}

export async function convertHeicToJpeg(file) {
  try {
    const heic2any = await heicLoader.importConverter()
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
    const blob = Array.isArray(result) ? result[0] : result
    if (!(blob instanceof Blob)) throw new Error('empty conversion')
    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch (error) {
    if (isHeicReadError(error)) throw error
    // The guest only sees "couldn't read that photo"; keep the real reason (chunk load, decoder) for us.
    console.error('convertHeicToJpeg failed', error)
    Sentry.captureException(error, {
      tags: { area: 'heic-convert' },
      extra: { fileType: file?.type || '', fileSize: file?.size ?? null },
    })
    throw new Error(HEIC_READ_ERROR, { cause: error })
  }
}

export async function convertHeicIfNeeded(file) {
  if (!isHeicFile(file)) return file
  return convertHeicToJpeg(file)
}
