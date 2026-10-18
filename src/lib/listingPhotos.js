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

export async function filesToPhotos(fileList, remaining) {
  const selected = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'))
  const toAdd = selected.slice(0, remaining)
  const photos = []
  for (const file of toAdd) {
    const compressed = await compressImage(file)
    photos.push({
      id: newId(),
      file: compressed,
      previewUrl: URL.createObjectURL(compressed),
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
