/** Same 4:3 as `--listing-cover-aspect` in index.css. Open Graph (later) is 1.91:1. */
export const LISTING_COVER_W = 4
export const LISTING_COVER_H = 3
export const LISTING_COVER_ASPECT = LISTING_COVER_W / LISTING_COVER_H

export function cropImageToBlob(image, croppedAreaPixels, { type = 'image/jpeg', quality = 0.8 } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas is not available'))

  const { width, height, x, y } = croppedAreaPixels
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), type, quality)
  })
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => reject(new Error('Could not load the photo')))
    image.crossOrigin = 'anonymous'
    image.src = src
  })
}

export function revokeIfBlobUrl(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url)
}

/** New picks keep the first file and its object URL. Saved listing photos do not. */
export function rememberOriginal(photo) {
  if (!photo || photo.originalUrl || photo.originalFile || !photo.file) return photo
  return {
    ...photo,
    originalFile: photo.file,
    originalUrl: photo.previewUrl,
  }
}

export function cropSourceUrl(photo) {
  return photo?.originalUrl || photo?.remoteUrl || photo?.previewUrl || ''
}

export function photoHasOriginal(photo) {
  return Boolean(photo?.originalFile || photo?.originalUrl)
}

export function photoIsCropped(photo) {
  if (!photoHasOriginal(photo)) return false
  return Boolean(photo.cropState) || photo.previewUrl !== photo.originalUrl
}

export function revokePhotoUrls(photo) {
  if (!photo) return
  revokeIfBlobUrl(photo.previewUrl)
  if (photo.originalUrl && photo.originalUrl !== photo.previewUrl) {
    revokeIfBlobUrl(photo.originalUrl)
  }
}

export function resetCroppedPhoto(photo) {
  if (!photoIsCropped(photo)) return photo
  if (photo.previewUrl !== photo.originalUrl) revokeIfBlobUrl(photo.previewUrl)
  return {
    ...photo,
    file: photo.originalFile,
    previewUrl: photo.originalUrl,
    cropState: null,
  }
}
