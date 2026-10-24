import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import ListingPhotosEditor from './ListingPhotosEditor'
import { filesToPhotos } from '../lib/listingPhotos'

vi.mock('react-easy-crop', () => ({
  default: function CropperMock({ image, crop, zoom, onCropComplete }) {
    useEffect(() => {
      onCropComplete(null, { x: 0, y: 0, width: 120, height: 90 })
      // Intentionally once per image: the real onCropComplete is an inline setter.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [image])
    return (
      <div data-testid="cropper" data-image={image} data-zoom={zoom} data-crop-x={crop?.x}>
        cropper
      </div>
    )
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

vi.mock('../lib/listingPhotos', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, filesToPhotos: vi.fn(actual.filesToPhotos) }
})

const originalFile = new File(['a'], 'a.png', { type: 'image/png' })
const photos = [
  {
    id: 'a',
    previewUrl: 'blob:a',
    file: originalFile,
    remoteUrl: null,
    originalFile,
    originalUrl: 'blob:a',
  },
  { id: 'b', previewUrl: 'https://cdn.test/b.jpg', file: null, remoteUrl: 'https://cdn.test/b.jpg' },
]

function dropZone() {
  return screen.getByText('Add photos').closest('label')
}

function dropFiles(files, types = ['Files']) {
  fireEvent.drop(dropZone(), {
    dataTransfer: { files, types },
  })
}

describe('ListingPhotosEditor', () => {
  it('keeps tiles to the photo, Cover badge and remove, and crops from the menu', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ListingPhotosEditor photos={photos} onChange={onChange} />)

    expect(screen.getByText('Add photos')).toBeInTheDocument()
    expect(screen.getByText('Tap to choose')).toBeInTheDocument()
    expect(screen.getByText('Click to choose, or drag photos here')).toBeInTheDocument()
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
    expect(screen.getByText('Crop the cover')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Free' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '4:3' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to original' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use this crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const next = onChange.mock.calls[0][0]
    expect(next[0].id).toBe('a')
    expect(next[0].file.name).toBe('cover.jpg')
    expect(next[0].originalUrl).toBe('blob:a')
    expect(next[0].originalFile).toBe(originalFile)
  })

  it('offers crop on every photo, and making one the cover does not open crop', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ListingPhotosEditor photos={photos} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Photo 2' }))
    expect(screen.getByRole('menuitem', { name: 'Crop' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Make cover' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Make cover' }))
    expect(onChange).toHaveBeenCalledWith([photos[1], photos[0]])
    expect(screen.queryByText('Crop the cover')).not.toBeInTheDocument()
    expect(screen.queryByText('Crop this photo')).not.toBeInTheDocument()
  })

  it('re-crops from the original and restores the previous crop and zoom', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const cropped = {
      ...photos[0],
      file: new File(['crop'], 'cover.jpg', { type: 'image/jpeg' }),
      previewUrl: 'blob:cropped',
      cropState: { crop: { x: 12, y: 4 }, zoom: 2.5 },
    }
    render(<ListingPhotosEditor photos={[cropped, photos[1]]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Photo 1 (cover)' }))
    await user.click(screen.getByRole('menuitem', { name: 'Crop' }))
    const cropper = screen.getByTestId('cropper')
    expect(cropper).toHaveAttribute('data-image', 'blob:a')
    expect(cropper).toHaveAttribute('data-zoom', '2.5')
    expect(cropper).toHaveAttribute('data-crop-x', '12')
  })

  it('resets a cropped new photo back to the original', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const cropped = {
      ...photos[0],
      file: new File(['crop'], 'cover.jpg', { type: 'image/jpeg' }),
      previewUrl: 'blob:cropped',
      cropState: { crop: { x: 8, y: 2 }, zoom: 1.4 },
    }
    render(<ListingPhotosEditor photos={[cropped]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Photo 1 (cover)' }))
    await user.click(screen.getByRole('menuitem', { name: 'Crop' }))
    await user.click(screen.getByRole('button', { name: 'Reset to original' }))

    expect(onChange).toHaveBeenCalledWith([
      {
        ...cropped,
        file: originalFile,
        previewUrl: 'blob:a',
        cropState: null,
      },
    ])
  })

  it('lets a cropped photo that is no longer the cover undo the crop', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const cropped = {
      ...photos[0],
      file: new File(['crop'], 'cover.jpg', { type: 'image/jpeg' }),
      previewUrl: 'blob:cropped',
      cropState: { crop: { x: 8, y: 2 }, zoom: 1.4 },
    }
    render(<ListingPhotosEditor photos={[photos[1], cropped]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Photo 2' }))
    expect(screen.getByRole('menuitem', { name: 'Crop' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Undo crop' }))
    expect(onChange).toHaveBeenCalledWith([
      photos[1],
      {
        ...cropped,
        file: originalFile,
        previewUrl: 'blob:a',
        cropState: null,
      },
    ])
  })

  it('does not show Reset for a saved listing photo', async () => {
    const user = userEvent.setup()
    render(
      <ListingPhotosEditor
        photos={[
          {
            id: 'saved',
            previewUrl: 'https://cdn.test/cover.jpg',
            file: null,
            remoteUrl: 'https://cdn.test/cover.jpg',
          },
        ]}
        onChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Photo 1 (cover)' }))
    await user.click(screen.getByRole('menuitem', { name: 'Crop' }))
    expect(screen.getByTestId('cropper')).toHaveAttribute('data-image', 'https://cdn.test/cover.jpg')
    expect(screen.queryByRole('button', { name: 'Reset to original' })).not.toBeInTheDocument()
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
    expect(onChange.mock.calls[0][0][0].originalFile).toBe(file)
    expect(input.value).toBe('')
    expect(
      screen.getByText("That photo didn't upload. Try again or pick a different one."),
    ).toBeInTheDocument()
  })

  it('closes the tile menu, removes a photo, and ignores an empty file pick', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    render(<ListingPhotosEditor photos={photos} onChange={onChange} />)

    const tile = screen.getByRole('button', { name: 'Photo 1 (cover)' })
    await user.click(tile)
    expect(screen.getByRole('menuitem', { name: 'Crop' })).toBeInTheDocument()
    await user.click(tile)
    expect(screen.queryByRole('menuitem', { name: 'Crop' })).not.toBeInTheDocument()

    await user.keyboard('{Enter}')
    expect(screen.getByRole('menuitem', { name: 'Crop' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menuitem', { name: 'Crop' })).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Remove photo' })[0])
    expect(onChange).toHaveBeenCalledWith([photos[1]])
    expect(revoke).toHaveBeenCalledWith('blob:a')

    fireEvent.change(screen.getByLabelText('Photos'), { target: { files: [] } })
    expect(onChange).toHaveBeenCalledTimes(1)
    revoke.mockRestore()
  })

  it('falls back when adding photos fails, and can cancel a crop', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    filesToPhotos.mockRejectedValueOnce(new Error('blocked'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ListingPhotosEditor photos={[]} onChange={onChange} />)

    const file = new File(['x'], 'latte.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Photos'), { target: { files: [file] } })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0][0].file).toBe(file)
    expect(error).toHaveBeenCalled()
    error.mockRestore()

    render(<ListingPhotosEditor photos={photos} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Photo 1 (cover)' }))
    await user.click(screen.getByRole('menuitem', { name: 'Crop' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Crop the cover')).not.toBeInTheDocument()
  })

  it('adds two dropped images and ignores a non-image drop with a hint', async () => {
    const onChange = vi.fn()
    render(<ListingPhotosEditor photos={[]} onChange={onChange} />)

    fireEvent.dragEnter(dropZone(), { dataTransfer: { types: ['Files'] } })
    expect(dropZone()).toHaveClass('photo-drop--over')

    dropFiles([
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
    ])
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0]).toHaveLength(2)
    expect(dropZone()).not.toHaveClass('photo-drop--over')

    dropFiles([new File(['notes'], 'notes.txt', { type: 'text/plain' })])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Those are not photos. Choose images instead.')).toBeInTheDocument()
  })

  it('respects the photo cap when dropping more than the remaining slots', async () => {
    const onChange = vi.fn()
    const view = render(<ListingPhotosEditor photos={[photos[0]]} onChange={onChange} max={2} />)

    dropFiles([
      new File(['two'], 'two.png', { type: 'image/png' }),
      new File(['three'], 'three.png', { type: 'image/png' }),
    ])
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0]).toHaveLength(2)

    onChange.mockClear()
    view.unmount()
    render(<ListingPhotosEditor photos={[photos[0], photos[1]]} onChange={onChange} max={2} />)
    dropFiles([new File(['four'], 'four.png', { type: 'image/png' })])
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Photos')).toBeDisabled()
  })

  function freshPhoto(id) {
    const file = new File([id], `${id}.png`, { type: 'image/png' })
    return {
      id,
      previewUrl: `blob:${id}`,
      file,
      remoteUrl: null,
      originalFile: file,
      originalUrl: `blob:${id}`,
    }
  }

  it('closes the menu on a grid-gap click and a drop-zone click', async () => {
    const user = userEvent.setup()
    render(<ListingPhotosEditor photos={photos} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Photo 1 (cover)' }))
    expect(screen.getByRole('menuitem', { name: 'Crop' })).toBeInTheDocument()

    fireEvent.pointerDown(document.querySelector('.preview-grid'))
    expect(screen.queryByRole('menuitem', { name: 'Crop' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Photo 1 (cover)' }))
    expect(screen.getByRole('menuitem', { name: 'Crop' })).toBeInTheDocument()

    fireEvent.pointerDown(dropZone())
    expect(screen.queryByRole('menuitem', { name: 'Crop' })).not.toBeInTheDocument()
  })

  it('switches menus when another tile is clicked', async () => {
    const user = userEvent.setup()
    render(<ListingPhotosEditor photos={photos} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Photo 1 (cover)' }))
    expect(screen.getByRole('menu', { name: 'Photo 1 (cover)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Photo 2' }))
    expect(screen.queryByRole('menu', { name: 'Photo 1 (cover)' })).not.toBeInTheDocument()
    expect(screen.getByRole('menu', { name: 'Photo 2' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Crop' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Make cover' })).toBeInTheDocument()
  })

  it('crops and undoes photo 3 from its menu', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const a = freshPhoto('a')
    const b = freshPhoto('b')
    const c = freshPhoto('c')
    const { rerender } = render(
      <ListingPhotosEditor photos={[a, b, c]} onChange={onChange} />,
    )

    await user.click(screen.getByRole('button', { name: 'Photo 3' }))
    await user.click(screen.getByRole('menuitem', { name: 'Crop' }))
    expect(screen.getByText('Crop this photo')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use this crop' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const cropped = onChange.mock.calls[0][0][2]
    expect(cropped.id).toBe('c')
    expect(cropped.file.name).toBe('cover.jpg')
    expect(cropped.originalUrl).toBe('blob:c')

    onChange.mockClear()
    rerender(<ListingPhotosEditor photos={[a, b, cropped]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Photo 3' }))
    await user.click(screen.getByRole('menuitem', { name: 'Undo crop' }))
    expect(onChange.mock.calls[0][0][2]).toMatchObject({
      id: 'c',
      file: c.file,
      previewUrl: 'blob:c',
      cropState: null,
    })
  })

  it('shows Undo crop on a cropped cover', async () => {
    const user = userEvent.setup()
    const cropped = {
      ...photos[0],
      file: new File(['crop'], 'cover.jpg', { type: 'image/jpeg' }),
      previewUrl: 'blob:cropped',
      cropState: { crop: { x: 8, y: 2 }, zoom: 1.4 },
    }
    render(<ListingPhotosEditor photos={[cropped]} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Photo 1 (cover)' }))
    expect(screen.getByRole('menuitem', { name: 'Crop' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Undo crop' })).toBeInTheDocument()
  })

  it('offers Crop but not Undo on a saved photo', async () => {
    const user = userEvent.setup()
    render(
      <ListingPhotosEditor
        photos={[
          {
            id: 'saved',
            previewUrl: 'https://cdn.test/cover.jpg',
            file: null,
            remoteUrl: 'https://cdn.test/cover.jpg',
          },
        ]}
        onChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Photo 1 (cover)' }))
    expect(screen.getByRole('menuitem', { name: 'Crop' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Undo crop' })).not.toBeInTheDocument()
  })

})
