import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import RequireAuth from '../components/RequireAuth'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'
import { HEIC_READ_ERROR, IMAGE_ACCEPT, heicLoader } from '../lib/heicImage'
import { PHOTO_REMOVED, PHOTO_UPDATED } from '../lib/avatarPhoto'

vi.mock('../lib/supabase')

vi.mock('react-easy-crop', () => ({
  default: function CropperMock({ image, onCropComplete }) {
    useEffect(() => {
      onCropComplete(null, { x: 0, y: 0, width: 120, height: 120 })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [image])
    return <div data-testid="cropper" />
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

const USER_ID = 'user-42'

function givenSignedIn(userId = USER_ID) {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: userId } }) },
    error: null,
  })
}

function givenProfile({
  full_name: fullName = 'Mei Ling',
  display_name: displayName = 'Mei',
  bio = '',
  email = 'mei@example.com',
  avatar_url: avatarUrl = null,
} = {}) {
  supabase.rpc.mockImplementation(async (fn) => {
    if (fn === 'my_account') {
      return {
        data: [
          {
            full_name: fullName,
            display_name: displayName,
            bio,
            email,
            avatar_url: avatarUrl,
          },
        ],
        error: null,
      }
    }
    return { data: null, error: null }
  })
}

async function renderSettings() {
  const utils = renderWithRouter(
    <RequireAuth>
      <Settings />
    </RequireAuth>,
    { route: '/settings', path: '/settings' }
  )
  await screen.findByRole('heading', { name: 'Settings', level: 1 })
  return utils
}

function imageFile(name = 'avatar.png') {
  return new File(['binary'], name, { type: 'image/png' })
}

beforeEach(() => {
  supabase.__reset()
  givenSignedIn()
  givenProfile()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Settings access', () => {
  it('shows the first letter of the display name when there is no photo', async () => {
    givenProfile({ full_name: 'Mei Ling Tan', display_name: 'Latte Queen', avatar_url: null })
    await renderSettings()

    expect(document.querySelector('.settings-avatar')).toHaveTextContent('L')
    expect(document.querySelector('.settings-avatar')).not.toHaveTextContent('ML')
    expect(document.querySelector('.settings-avatar')).not.toHaveTextContent('LQ')
  })

  it('loads the signed-in user own profile', async () => {
    await renderSettings()

    expect(supabase.rpc).toHaveBeenCalledWith('my_account')
    expect(screen.getByLabelText('About you')).toHaveValue('')
    expect(screen.getByText('0/500')).toBeInTheDocument()
    expect(
      screen.getByText('Tell guests a bit about yourself and what you love sharing.')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveValue('Mei Ling')
    expect(screen.getByText('Private, never shown publicly.')).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveValue('Mei')
    expect(screen.getByText('Shown on your profile and reviews.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('mei@example.com')
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument()
  })

  it('reports a load failure', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    renderWithRouter(
      <RequireAuth>
        <Settings />
      </RequireAuth>,
      { route: '/settings', path: '/settings' }
    )

    expect(
      await screen.findByText('Something went wrong loading this page. Please refresh.')
    ).toBeInTheDocument()
    expect(screen.queryByText('permission denied')).not.toBeInTheDocument()
  })
})

describe('Settings profile form', () => {
  it('shows email as read-only and points the user at support', async () => {
    await renderSettings()

    const email = screen.getByLabelText('Email')
    expect(email).toBeDisabled()
    expect(email).toHaveAttribute('readOnly')
    expect(screen.getByText(/Email cannot be changed here/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'hello@trykai.sg' })[0]).toHaveAttribute(
      'href',
      'mailto:hello@trykai.sg'
    )
  })

  it('does not offer an in-app delete control', async () => {
    await renderSettings()

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Delete your account' })).not.toBeInTheDocument()
    expect(
      screen.getByText(/Transaction records may need to be kept for dispute and tax purposes/)
    ).toBeInTheDocument()
  })

  it('signs the user out and sends them home', async () => {
    const { user, currentPath } = await renderSettings()

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(supabase.auth.signOut).toHaveBeenCalledOnce()
    await waitFor(() => expect(currentPath()).toBe('/'))
  })

  it('requires a full name before saving', async () => {
    const { user } = await renderSettings()

    await user.clear(screen.getByLabelText('Full name'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Please enter your full name.')).toBeInTheDocument()
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
  })

  it('requires a display name before saving', async () => {
    const { user } = await renderSettings()

    await user.clear(screen.getByLabelText('Display name'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Please enter a display name.')).toBeInTheDocument()
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
  })

  it('saves the writable name columns', async () => {
    const { user } = await renderSettings()

    await user.clear(screen.getByLabelText('Full name'))
    await user.type(screen.getByLabelText('Full name'), '  Mei Ling Tan  ')
    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), '  Latte Queen  ')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    const call = supabase.__lastCall('users', 'update')
    expect(call.payload).toEqual({
      full_name: 'Mei Ling Tan',
      display_name: 'Latte Queen',
      bio: null,
    })
    expect(call.filters).toContainEqual({ method: 'eq', column: 'id', value: USER_ID })
    expect(call.chain.some((step) => step.method === 'select')).toBe(false)
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Saved')
    expect(document.querySelector('.settings-save')).toContainElement(status)
    expect(document.querySelector('.settings-save')).toContainElement(
      screen.getByRole('button', { name: 'Save changes' }),
    )
  })

  it('saves a cropped photo straight away and leaves form Save for names', async () => {
    const { user } = await renderSettings()
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Profile photo'), {
      target: { files: [imageFile('face.png')] },
    })
    expect(await screen.findByText('Crop your photo')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use this crop' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Use this crop' }))

    await waitFor(() => expect(supabase.__bucket('listing-photos').upload).toHaveBeenCalledOnce())
    const uploadedPath = supabase.__bucket('listing-photos').upload.mock.calls[0][0]
    expect(uploadedPath).toMatch(new RegExp(`^${USER_ID}/avatar-.+\\.jpg$`))
    expect(supabase.__lastCall('users', 'update').payload).toEqual({
      avatar_url: `https://cdn.test/listing-photos/${uploadedPath}`,
    })
    expect(screen.getByRole('status')).toHaveTextContent(PHOTO_UPDATED)

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(2))
    expect(supabase.__calls('users', 'update')[1].payload).toEqual({
      full_name: 'Mei Ling',
      display_name: 'Mei',
      bio: null,
    })
  })

  it('keeps the existing photo when the form is saved', async () => {
    givenProfile({ avatar_url: 'https://cdn.test/existing.jpg' })
    const { user } = await renderSettings()

    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'update').payload).toEqual({
      full_name: 'Mei Ling',
      display_name: 'Mei',
      bio: null,
    })
    expect(supabase.__bucket('listing-photos').upload).not.toHaveBeenCalled()
  })

  it('shows a storage error and does not update the profile', async () => {
    const { user } = await renderSettings()
    supabase
      .__bucket('listing-photos')
      .upload.mockResolvedValue({ data: null, error: { message: 'storage full' } })
    fireEvent.change(screen.getByLabelText('Profile photo'), {
      target: { files: [imageFile()] },
    })
    expect(await screen.findByText('Crop your photo')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use this crop' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Use this crop' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('storage full')
    expect(screen.queryByText(PHOTO_UPDATED)).not.toBeInTheDocument()
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
  })

  it('offers HEIC files in the profile photo picker', async () => {
    await renderSettings()
    expect(screen.getByLabelText('Profile photo')).toHaveAttribute('accept', IMAGE_ACCEPT)
  })

  it('does not upload a HEIC that cannot be read', async () => {
    const load = vi.spyOn(heicLoader, 'importConverter').mockRejectedValue(new Error('wasm'))
    await renderSettings()
    fireEvent.change(screen.getByLabelText('Profile photo'), {
      target: { files: [new File(['h'], 'face.heic', { type: 'image/heic' })] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(HEIC_READ_ERROR)
    expect(screen.queryByText('Crop your photo')).not.toBeInTheDocument()
    expect(supabase.__bucket('listing-photos').upload).not.toHaveBeenCalled()
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
    load.mockRestore()
  })

  it('removes the photo after confirm and says Photo removed', async () => {
    givenProfile({ avatar_url: 'https://cdn.test/existing.jpg' })
    const { user } = await renderSettings()

    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    const confirm = screen.getByRole('dialog')
    expect(confirm).toHaveTextContent('Remove your profile photo?')
    await user.click(within(confirm).getByRole('button', { name: 'Remove photo' }))

    await waitFor(() => expect(supabase.__lastCall('users', 'update').payload).toEqual({ avatar_url: null }))
    expect(screen.getByRole('status')).toHaveTextContent(PHOTO_REMOVED)
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument()
  })

  it('counts About you live and saves a trimmed bio', async () => {
    const { user } = await renderSettings()
    const about = screen.getByLabelText('About you')

    await user.type(about, '  Line one{enter}Line two  ')
    expect(screen.getByText(`${about.value.length}/500`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'update').payload.bio).toBe('Line one\nLine two')
  })

  it('stores an empty About as null', async () => {
    givenProfile({ bio: 'Old bio' })
    const { user } = await renderSettings()

    await user.clear(screen.getByLabelText('About you'))
    expect(screen.getByText('0/500')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'update').payload.bio).toBeNull()
  })

  it('caps About you at 500 characters', async () => {
    await renderSettings()
    expect(screen.getByLabelText('About you')).toHaveAttribute('maxLength', '500')
  })

  it('shows an update error from the database', async () => {
    supabase.__on('users', 'update', { error: { message: 'not allowed' } })
    const { user } = await renderSettings()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('keeps a save error after 5 seconds until the host edits', async () => {
    supabase.__on('users', 'update', { error: { message: 'not allowed' } })
    const { user } = await renderSettings()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed')

    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(5000)
    expect(screen.getByRole('alert')).toHaveTextContent('not allowed')
    vi.useRealTimers()

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Mei x' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('fades only Saved after 4 seconds', () => {
    const source = readFileSync(resolve(import.meta.dirname, './Settings.jsx'), 'utf8')
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(source).toMatch(/saveStatusKind !== 'success'/)
    expect(source).toMatch(/setSaveStatusFading\(true\), 4000\)/)
    expect(source).toMatch(/\}, 4400\)/)
    expect(css).toMatch(/\.settings-save-status--fade \{[\s\S]*?opacity:\s*0;/)
  })
})
