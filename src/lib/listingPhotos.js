import { compressImage } from './compressImage'
import { HEIC_READ_ERROR, isHeicFile, isHeicReadError, isImageFile } from './heicImage'

function newId() {
  return crypto.randomUUID?.() ?? `photo-${Date.now()}-${Math.random()}`
}

export function photoFromRemote(url) {
  return { id: url, previewUrl: url, file: null, remoteUrl: url }
}

export function photosFromUrls(urls) {
  return (urls ?? []).filter(Boolean).map(photoFromRemote)
}

/** Copy the file list before the input is reset — FileList is live and clears with value. */
export function snapshotImageFiles(fileList) {
  return Array.from(fileList || []).filter(isImageFile)
}

export async function filesToPhotos(fileList, remaining) {
  const toAdd = snapshotImageFiles(fileList).slice(0, remaining)
  const photos = []
  let error = null
  for (const file of toAdd) {
    let compressed
    try {
      compressed = await compressImage(file)
    } catch (caught) {
      if (isHeicReadError(caught)) {
        error = caught
        continue
      }
      console.error('filesToPhotos: using the original file', caught)
      compressed = file
    }
    const ready = compressed || file
    if (isHeicFile(ready)) {
      error = error ?? new Error(HEIC_READ_ERROR)
      continue
    }
    photos.push({
      id: newId(),
      file: ready,
      previewUrl: URL.createObjectURL(ready),
      remoteUrl: null,
    })
  }
  return { photos, error }
}

export async function uploadListingPhotos(photos, userId, storage, { onProgress } = {}) {
  const urls = []
  const uploadTotal = photos.filter((photo) => photo.file).length
  let uploaded = 0
  for (const photo of photos) {
    if (photo.file) {
      uploaded += 1
      onProgress?.({ index: uploaded, total: uploadTotal })
      const ext = photo.file.name.split('.').pop() || 'jpg'
      const path = `${userId}/${crypto.randomUUID()}.${ext}`
      const { error } = await storage.from('listing-photos').upload(path, photo.file)
      if (error) throw error
      const { data } = storage.from('listing-photos').getPublicUrl(path)
      urls.push(data.publicUrl)
    } else if (photo.remoteUrl) {
      urls.push(photo.remoteUrl)
    }
  }
  return urls
}

export function movePhoto(photos, from, to) {
  if (to < 0 || to >= photos.length || from === to) return photos
  const next = [...photos]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
