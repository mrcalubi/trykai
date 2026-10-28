import { supabase } from './supabase'

export const AVATAR_ASPECT = 1
export const PHOTO_UPDATED = 'Photo updated'
export const PHOTO_REMOVED = 'Photo removed'
export const REMOVE_PHOTO_CONFIRM = 'Remove your profile photo?'

export async function uploadAvatarFile(file, userId, storage = supabase.storage) {
  const ext = String(file?.name || 'jpg').split('.').pop() || 'jpg'
  const path = `${userId}/avatar-${crypto.randomUUID()}.${ext}`
  const { error } = await storage.from('listing-photos').upload(path, file)
  if (error) throw error
  const { data } = storage.from('listing-photos').getPublicUrl(path)
  return data.publicUrl
}

export async function saveAvatarUrl(userId, avatarUrl, client = supabase) {
  const { error } = await client.from('users').update({ avatar_url: avatarUrl }).eq('id', userId)
  if (error) throw error
}

export function hasAvatarPhoto(avatarUrl) {
  return typeof avatarUrl === 'string' && Boolean(avatarUrl.trim())
}

/** Wide profile banner. Same bucket and folder as the avatar (00041 checks the path). */
export async function uploadBannerFile(file, userId, storage = supabase.storage) {
  const path = `${userId}/banner-${crypto.randomUUID()}.jpg`
  const { error } = await storage.from('listing-photos').upload(path, file)
  if (error) throw error
  const { data } = storage.from('listing-photos').getPublicUrl(path)
  return data.publicUrl
}
