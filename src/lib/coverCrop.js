/** Browse cards use 4 / 3 (`ui-card__image-wrap`). Cover crop matches that. */
export const LISTING_COVER_ASPECT = 4 / 3

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
