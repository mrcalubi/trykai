import { describe, expect, it, vi } from 'vitest'
import { hasAvatarPhoto, saveAvatarUrl, uploadAvatarFile } from './avatarPhoto'

describe('avatarPhoto', () => {
  it('treats a non-empty URL as a photo', () => {
    expect(hasAvatarPhoto('https://cdn.test/face.jpg')).toBe(true)
    expect(hasAvatarPhoto('  ')).toBe(false)
    expect(hasAvatarPhoto(null)).toBe(false)
  })

  it('uploads to listing-photos and returns the public URL', async () => {
    const upload = vi.fn(async () => ({ error: null }))
    const storage = {
      from: () => ({
        upload,
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    }

    const url = await uploadAvatarFile(new File(['x'], 'avatar.jpg', { type: 'image/jpeg' }), 'user-1', storage)

    expect(upload).toHaveBeenCalledOnce()
    expect(upload.mock.calls[0][0]).toMatch(/^user-1\/avatar-.+\.jpg$/)
    expect(url).toMatch(/^https:\/\/cdn\.test\/user-1\/avatar-/)
  })

  it('writes avatar_url on the caller row', async () => {
    const eq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq }))
    const client = { from: () => ({ update }) }

    await saveAvatarUrl('user-1', 'https://cdn.test/new.jpg', client)

    expect(update).toHaveBeenCalledWith({ avatar_url: 'https://cdn.test/new.jpg' })
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })
})
