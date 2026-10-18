import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import ListingPhotosEditor from './ListingPhotosEditor'

vi.mock('react-easy-crop', () => ({
  default: function CropperMock({ onCropComplete }) {
    useEffect(() => {
      onCropComplete(null, { x: 0, y: 0, width: 120, height: 90 })
      // Intentionally once: the real onCropComplete is an inline setter.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div>cropper</div>
  },
}))

vi.mock('../lib/coverCrop', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    loadImage: vi.fn(async () => ({})),
    cropImageToBlob: vi.fn(async () => new Blob(['crop'], { type: 'image/jpeg' })),
  }
})

vi.mock('../lib/compressImage', () => ({
  compressImage: vi.fn(async (file) => file),
}))

const photos = [
  { id: 'a', previewUrl: 'blob:a', file: new File(['a'], 'a.png', { type: 'image/png' }), remoteUrl: null },
  { id: 'b', previewUrl: 'https://cdn.test/b.jpg', file: null, remoteUrl: 'https://cdn.test/b.jpg' },
]

describe('ListingPhotosEditor', () => {
  it('reorders by drop and applies a cover crop', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<ListingPhotosEditor photos={photos} onChange={onChange} />)

    const items = document.querySelectorAll('.preview-item')
    fireEvent.dragStart(items[1])
    fireEvent.dragOver(items[0])
    fireEvent.drop(items[0])
    expect(onChange).toHaveBeenCalledWith([photos[1], photos[0]])

    await user.click(screen.getByRole('button', { name: 'Crop cover' }))
    expect(screen.getByText('Crop the cover to the listing card')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use this crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    const next = onChange.mock.calls[1][0]
    expect(next[0].id).toBe('a')
    expect(next[0].file.name).toBe('cover.jpg')

    rerender(<ListingPhotosEditor photos={photos} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Crop cover' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Crop the cover to the listing card')).not.toBeInTheDocument()
  })
})
