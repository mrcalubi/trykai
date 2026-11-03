import { compressImage } from './compressImage'
import { HEIC_READ_ERROR, IMAGE_ACCEPT, isHeicFile, isHeicPickerError } from './heicImage'
import { snapshotImageFiles } from './listingPhotos'

export const MAX_REVIEW_PHOTOS = 3
export const REVIEW_PHOTO_MAX_BYTES = 3 * 1024 * 1024
export const REVIEW_PHOTOS_BUCKET = 'review-photos'
export const REVIEW_PHOTO_TOO_LARGE = 'This photo is too large. Try a different one.'
export const REVIEW_PHOTO_CONSENT =
  'Add up to 3 photos of what you made. Only photos you took, and ask before including anyone else.'
export { IMAGE_ACCEPT }

function newId() {
  return crypto.randomUUID?.() ?? `photo-${Date.now()}-${Math.random()}`
}

export function reviewPhotoPublicUrl(path, storage) {
  if (!path) return ''
  const { data } = storage.from(REVIEW_PHOTOS_BUCKET).getPublicUrl(path)
  return data?.publicUrl || ''
}

export async function compressReviewPhoto(file) {
  let compressed
  try {
    compressed = await compressImage(file, { strict: true })
  } catch (caught) {
    if (isHeicPickerError(caught)) throw caught
    throw new Error(HEIC_READ_ERROR, { cause: caught })
  }
  if (!compressed || isHeicFile(compressed) || compressed === file) {
    throw new Error(HEIC_READ_ERROR)
  }
  if (compressed.size > REVIEW_PHOTO_MAX_BYTES) {
    throw new Error(REVIEW_PHOTO_TOO_LARGE)
  }
  return compressed
}

export async function filesToReviewPhotos(fileList, remaining) {
  const toAdd = snapshotImageFiles(fileList).slice(0, remaining)
  const photos = []
  const errors = []
  for (const file of toAdd) {
    try {
      const compressed = await compressReviewPhoto(file)
      photos.push({
        id: newId(),
        file: compressed,
        previewUrl: URL.createObjectURL(compressed),
        name: file.name,
      })
    } catch (caught) {
      errors.push({ name: file.name, message: caught?.message || HEIC_READ_ERROR })
    }
  }
  return { photos, errors }
}

export function reviewPhotoUploadError(index, name) {
  const label = name ? `"${name}"` : `Photo ${index + 1}`
  return `${label} didn't upload. Try again or pick a different one.`
}

export async function uploadReviewPhotos(photos, userId, storage) {
  const paths = []
  for (const [index, photo] of photos.entries()) {
    const path = `${userId}/${crypto.randomUUID()}.jpg`
    const { error } = await storage.from(REVIEW_PHOTOS_BUCKET).upload(path, photo.file, {
      upsert: false,
      contentType: photo.file.type || 'image/jpeg',
    })
    if (error) {
      throw new Error(reviewPhotoUploadError(index, photo.name))
    }
    paths.push(path)
  }
  return paths
}
