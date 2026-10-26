import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProfilePhotoFlow from './ProfilePhotoFlow'
import { compressImage } from '../lib/compressImage'
import { HEIC_READ_ERROR } from '../lib/heicImage'
import { PHOTO_REMOVED, PHOTO_UPDATED, REMOVE_PHOTO_CONFIRM } from '../lib/avatarPhoto'

vi.mock('react-easy-crop', () => ({
  default: function CropperMock({ image, cropShape, onCropComplete }) {
    useEffect(() => {
      onCropComplete(null, { x: 0, y: 0, width: 120, height: 120 })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [image])
    return <div data-testid="cropper" data-image={image} data-shape={cropShape} />
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

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
    from: () => ({
      update: () => ({
        eq: vi.fn(async () => ({ error: null })),
      }),
    }),
  },
}))

function renderFlow(onAvatarUrlChange = vi.fn()) {
  return render(
    <ProfilePhotoFlow userId="user-42" onAvatarUrlChange={onAvatarUrlChange}>
      {({ changePhoto, removePhoto, status, statusKind, busy }) => (
        <div>
          <button type="button" onClick={changePhoto} disabled={busy}>
            Change photo
          </button>
          <button type="button" onClick={removePhoto} disabled={busy}>
            Remove photo
          </button>
          {status ? <p role={statusKind === 'error' ? 'alert' : 'status'}>{status}</p> : null}
        </div>
      )}
    </ProfilePhotoFlow>,
  )
}

function pick(file) {
  fireEvent.change(screen.getByLabelText('Profile photo'), { target: { files: [file] } })
}

describe('ProfilePhotoFlow', () => {
  afterEach(() => {
    compressImage.mockReset()
    compressImage.mockImplementation(async (file) => file)
  })

  it('compresses the picked file before the crop dialog opens', async () => {
    const converted = new File(['jpeg'], 'face.jpg', { type: 'image/jpeg' })
    compressImage.mockResolvedValueOnce(converted)
    renderFlow()

    pick(new File(['heic'], 'face.heic', { type: 'image/heic' }))

    expect(await screen.findByText('Crop your photo')).toBeInTheDocument()
    expect(compressImage).toHaveBeenCalledOnce()
    expect(screen.getByTestId('cropper')).toHaveAttribute('data-shape', 'round')
    expect(screen.getByTestId('cropper').getAttribute('data-image')).toMatch(/^blob:/)
  })

  it('shows the read error and uploads nothing when conversion fails', async () => {
    compressImage.mockRejectedValueOnce(new Error(HEIC_READ_ERROR))
    const onAvatarUrlChange = vi.fn()
    renderFlow(onAvatarUrlChange)

    pick(new File(['h'], 'face.heic', { type: 'image/heic' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(HEIC_READ_ERROR)
    expect(screen.queryByText('Crop your photo')).not.toBeInTheDocument()
    expect(onAvatarUrlChange).not.toHaveBeenCalled()
  })

  it('uploads the crop and saves avatar_url straight away', async () => {
    const user = userEvent.setup()
    const onAvatarUrlChange = vi.fn()
    renderFlow(onAvatarUrlChange)

    pick(new File(['x'], 'face.png', { type: 'image/png' }))
    expect(await screen.findByText('Crop your photo')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use this crop' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Use this crop' }))

    await waitFor(() => expect(onAvatarUrlChange).toHaveBeenCalled())
    expect(onAvatarUrlChange.mock.calls[0][0]).toMatch(/^https:\/\/cdn\.test\/user-42\/avatar-/)
    expect(screen.getByRole('status')).toHaveTextContent(PHOTO_UPDATED)
    expect(screen.queryByText('Crop your photo')).not.toBeInTheDocument()
  })

  it('asks before removing and then clears avatar_url', async () => {
    const user = userEvent.setup()
    const onAvatarUrlChange = vi.fn()
    renderFlow(onAvatarUrlChange)

    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    const confirm = screen.getByRole('dialog')
    expect(confirm).toHaveTextContent(REMOVE_PHOTO_CONFIRM)

    await user.click(within(confirm).getByRole('button', { name: 'Remove photo' }))

    await waitFor(() => expect(onAvatarUrlChange).toHaveBeenCalledWith(null))
    expect(screen.getByRole('status')).toHaveTextContent(PHOTO_REMOVED)
  })
})
