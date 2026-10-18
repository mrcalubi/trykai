const MAX_EDGE = 1600
const QUALITY = 0.82

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('toBlob is not available'))
      return
    }
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), type, quality)
  })
}

function isHeadlessImageHost() {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')
}

function fallback(file, error) {
  console.error('compressImage: using the original file', error)
  return file
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    let settled = false
    const url = URL.createObjectURL(file)
    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      fn(arg)
    }

    const image = new Image()
    image.onload = () => finish(resolve, image)
    image.onerror = () => finish(reject, new Error('Could not read the photo'))
    image.src = url

    // jsdom often never fires load/error. Do not time out a real browser:
    // a large phone photo can take longer than a short timer to decode.
    queueMicrotask(() => {
      if (settled) return
      if (image.naturalWidth || image.width) finish(resolve, image)
      else if (image.complete || isHeadlessImageHost()) {
        finish(reject, new Error('Could not read the photo'))
      }
    })
  })
}

async function sourceFromFile(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      if (bitmap.width && bitmap.height) {
        return { image: bitmap, close: () => bitmap.close?.() }
      }
      bitmap.close?.()
    } catch {
      // Fall through to Image. Some environments expose a broken bitmap API.
    }
  }
  return { image: await loadImageFromFile(file), close: () => {} }
}

/**
 * Shrink an image on the main thread before upload: long edge 1600px, JPEG 0.82.
 * No workers, no eval. Any failure returns the original file so upload can proceed.
 */
export async function compressImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  let close = () => {}
  try {
    if (!file || !String(file.type || '').startsWith('image/')) return file

    const source = await sourceFromFile(file)
    close = source.close
    const image = source.image
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    if (!sourceWidth || !sourceHeight) return fallback(file, new Error('Could not read the photo'))

    const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return fallback(file, new Error('no 2d context'))

    ctx.drawImage(image, 0, 0, width, height)
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch (error) {
    return fallback(file, error)
  } finally {
    close()
  }
}
