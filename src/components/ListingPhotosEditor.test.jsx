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
  it('keeps tiles to the photo, Cover badge and remove, and crops from the menu', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ListingPhotosEditor photos={photos} onChange={onChange} />)

    expect(screen.getByText('Drag to reorder. The first photo is your cover.')).toBeInTheDocument()
    expect(document.querySelector('.preview-item__cover')).toHaveTextContent('Cover')
    expect(screen.queryByRole('button', { name: 'Move photo left' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set as cover' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crop' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Photo 1 (cover)' }))
    expect(screen.getByRole('menuitem', { name: 'Crop' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Make cover' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Crop' }))
    expect(screen.getByText('Crop the cover to the listing card')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Free' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use this crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const next = onChange.mock.calls[0][0]
    expect(next[0].id).toBe('a')
    expect(next[0].file.name).toBe('cover.jpg')
  })

  it('makes a later photo the cover and crops it with a Free option', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<ListingPhotosEditor photos={photos} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Photo 2' }))
    await user.click(screen.getByRole('menuitem', { name: 'Make cover' }))
    expect(onChange).toHaveBeenCalledWith([photos[1], photos[0]])

    rerender(<ListingPhotosEditor photos={[photos[1], photos[0]]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Photo 2' }))
    await user.click(screen.getByRole('menuitem', { name: 'Crop' }))
    expect(screen.getByText('Crop this photo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '4:3' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Free' }))
    await user.click(screen.getByRole('button', { name: 'Use this crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    expect(onChange.mock.calls[1][0][1].file.name).toBe('photo.jpg')
  })

  it('reorders with the keyboard so the dragged photo becomes the cover', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ListingPhotosEditor photos={photos} onChange={onChange} />)

    screen.getByRole('button', { name: 'Photo 2' }).focus()
    await user.keyboard('[Space]')
    await user.keyboard('[ArrowLeft]')
    await user.keyboard('[Space]')

    expect(onChange).toHaveBeenCalledWith([photos[1], photos[0]])
  })

  it('keeps selected files after the input is reset, and shows an upload error', async () => {
    const onChange = vi.fn()
    render(
      <ListingPhotosEditor
        photos={[]}
        onChange={onChange}
        error={"That photo didn't upload. Try again or pick a different one."}
      />,
    )

    const input = screen.getByLabelText('Photos')
    const file = new File(['x'], 'latte.png', { type: 'image/png' })
    let current = [file]
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => current,
    })
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => (current.length ? 'C:\\fakepath\\latte.png' : ''),
      set: (next) => {
        if (next === '') current = []
      },
    })

    fireEvent.change(input)
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0][0].file).toBe(file)
    expect(input.value).toBe('')
    expect(
      screen.getByText("That photo didn't upload. Try again or pick a different one."),
    ).toBeInTheDocument()
  })
})
