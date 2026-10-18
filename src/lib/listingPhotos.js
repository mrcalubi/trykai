import { compressImage } from './compressImage'

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
  return Array.from(fileList || []).filter((file) => file?.type?.startsWith('image/'))
}

export async function filesToPhotos(fileList, remaining) {
  const toAdd = snapshotImageFiles(fileList).slice(0, remaining)
  const photos = []
  for (const file of toAdd) {
    let compressed
    try {
      compressed = await compressImage(file)
    } catch (error) {
      console.error('filesToPhotos: using the original file', error)
      compressed = file
    }
    const ready = compressed || file
    photos.push({
      id: newId(),
      file: ready,
      previewUrl: URL.createObjectURL(ready),
      remoteUrl: null,
    })
  }
  return photos
}

export async function uploadListingPhotos(photos, userId, storage) {
  const urls = []
  for (const photo of photos) {
    if (photo.file) {
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
