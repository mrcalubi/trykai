import { describe, expect, it } from 'vitest'
import { compressImage } from './compressImage'

describe('compressImage', () => {
  it('returns the original file when the browser cannot draw it', async () => {
    const file = new File(['binary'], 'avatar.png', { type: 'image/png' })
    await expect(compressImage(file)).resolves.toBe(file)
  })

  it('leaves non-images alone', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    await expect(compressImage(file)).resolves.toBe(file)
  })
})
