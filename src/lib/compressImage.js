const MAX_EDGE = 1600
const QUALITY = 0.8

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('toBlob is not available'))
      return
    }
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), type, quality)
  })
}

function supportsWebp(canvas) {
  try {
    return canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
}

/**
 * Shrink an image before upload: long edge 1600px, JPEG or WebP at ~0.8.
 * Falls back to the original file when the browser cannot draw it.
 */
export async function compressImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) return file
  if (typeof createImageBitmap !== 'function') return file

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close?.()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const type = supportsWebp(canvas) ? 'image/webp' : 'image/jpeg'
  try {
    const blob = await canvasToBlob(canvas, type, quality)
    const ext = type === 'image/webp' ? 'webp' : 'jpg'
    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${base}.${ext}`, { type, lastModified: Date.now() })
  } catch {
    return file
  }
}
