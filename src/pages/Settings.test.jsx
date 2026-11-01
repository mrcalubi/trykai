import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import Logout from './Logout'
import RequireAuth from '../components/RequireAuth'
import SiteNav from '../components/SiteNav'
import { supabase } from '../lib/supabase'
import { renderWithDataRouter } from '../test/render'
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

let account = {}

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
  ...rest
} = {}) {
  account = {
    full_name: fullName,
    display_name: displayName,
    bio,
    email,
    avatar_url: avatarUrl,
    ...rest,
  }
  supabase.rpc.mockImplementation(async (fn) => {
    if (fn === 'my_account') {
      return { data: [{ ...account }], error: null }
    }
    return { data: null, error: null }
  })
}

async function renderSettings({ withNav = false, extraRoutes = null, route = '/settings' } = {}) {
  const utils = renderWithDataRouter(
    <RequireAuth>
      {withNav ? <SiteNav /> : null}
      <Settings />
    </RequireAuth>,
    { route, path: '/settings', extraRoutes },
  )
  await screen.findByRole('heading', { name: 'Edit profile', level: 1 })
  return utils
}

function imageFile(name = 'avatar.png') {
  return new File(['binary'], name, { type: 'image/png' })
}

beforeEach(() => {
  supabase.__reset()
  givenSignedIn()
  givenProfile()
  supabase.__on('users', 'update', ({ payload }) => {
    Object.assign(account, payload)
    return { data: null, error: null }
  })
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
    expect(screen.getByRole('heading', { name: 'Private details' })).toBeInTheDocument()
  })

  it('reports a load failure', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    renderWithDataRouter(
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
    const { user, currentPath } = await renderSettings({ extraRoutes: logoutRoutes() })

    await user.click(screen.getByRole('link', { name: 'Log out' }))

    expect(supabase.auth.signOut).toHaveBeenCalled()
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

  it('updates the nav face after a photo change without a reload', async () => {
    const { user } = await renderSettings({ withNav: true })
    const nav = await screen.findByRole('link', { name: 'Your profile' })
    await waitFor(() => expect(nav).toHaveTextContent('M'))

    fireEvent.change(screen.getByLabelText('Profile photo'), {
      target: { files: [imageFile('face.png')] },
    })
    expect(await screen.findByText('Crop your photo')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use this crop' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Use this crop' }))

    await waitFor(() => expect(nav.querySelector('img')).toBeTruthy())
    expect(nav.querySelector('img').getAttribute('src')).toMatch(/\/avatar-.+\.jpg$/)
  })

  it('updates the nav initial after a display name save without a reload', async () => {
    const { user } = await renderSettings({ withNav: true })
    const nav = await screen.findByRole('link', { name: 'Your profile' })
    await waitFor(() => expect(nav).toHaveTextContent('M'))

    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Latte Queen')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(nav).toHaveTextContent('L'))
    expect(nav).not.toHaveTextContent('M')
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
    expect(screen.getByLabelText('About you')).toHaveAttribute('id', 'bio')
  })

  it('focuses About you when opened at #bio', async () => {
    await renderSettings({ route: '/settings#bio' })
    expect(screen.getByLabelText('About you')).toHaveFocus()
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

function logoutRoutes() {
  return (
    <>
      <Route path="/" element={<h1>Home</h1>} />
      <Route path="/logout" element={<Logout />} />
    </>
  )
}

describe('Settings unsaved changes', () => {
  const homeRoute = <Route path="/" element={<h1>Home</h1>} />

  async function renderWithLeave() {
    return renderSettings({
      withNav: true,
      extraRoutes: homeRoute,
    })
  }

  it('asks before leaving when the display name is dirty, and Keep editing stays', async () => {
    const { user } = await renderWithLeave()

    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Latte Queen')
    await user.click(screen.getByRole('link', { name: 'TryKai home' }))

    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument()
    expect(screen.getByText("You have changes you haven't saved.")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Keep editing' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Edit profile', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveValue('Latte Queen')
  })

  it('leaves after Discard', async () => {
    const { user } = await renderWithLeave()

    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Latte Queen')
    await user.click(screen.getByRole('link', { name: 'TryKai home' }))
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit profile', level: 1 })).not.toBeInTheDocument()
  })

  it('navigates without a dialog when nothing has changed', async () => {
    const { user } = await renderWithLeave()

    await user.click(screen.getByRole('link', { name: 'TryKai home' }))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not ask after a successful Save', async () => {
    const { user } = await renderWithLeave()

    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Latte Queen')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Saved')

    await user.click(screen.getByRole('link', { name: 'TryKai home' }))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before logging out when dirty, and Keep editing stays signed in', async () => {
    const { user } = await renderSettings({ extraRoutes: logoutRoutes() })

    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Latte Queen')
    await user.click(screen.getByRole('link', { name: 'Log out' }))

    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Keep editing' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Edit profile', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveValue('Latte Queen')
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('signs out and lands on home after Discard from Log out', async () => {
    const { user, currentPath } = await renderSettings({ extraRoutes: logoutRoutes() })

    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Latte Queen')
    await user.click(screen.getByRole('link', { name: 'Log out' }))
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(supabase.auth.signOut).toHaveBeenCalled()
    await waitFor(() => expect(currentPath()).toBe('/'))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('does not treat restoring the original display name as dirty', async () => {
    const { user } = await renderWithLeave()

    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Latte Queen')
    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Mei')
    await user.click(screen.getByRole('link', { name: 'TryKai home' }))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Edit profile v2 fields', () => {
  function givenV2(row = {}) {
    supabase.__on('users', 'select', {
      data: {
        banner_preset: null,
        banner_url: null,
        featured_review_id: null,
        instagram_handle: null,
        tiktok_handle: null,
        ...row,
      },
      error: null,
    })
  }

  function givenHostWithReviews(reviews) {
    account = { ...account, is_host: true }
    supabase.rpc.mockImplementation(async (fn) => {
      if (fn === 'my_account') return { data: [{ ...account }], error: null }
      if (fn === 'reviews_for_host') return { data: reviews, error: null }
      return { data: null, error: null }
    })
  }

  it('hides banner, socials and featured review until 00041 is applied', async () => {
    supabase.__on('users', 'select', {
      data: null,
      error: { code: '42703', message: 'column users.banner_preset does not exist' },
    })
    await renderSettings()

    expect(screen.queryByRole('heading', { name: 'Banner' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Instagram')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveValue('Mei')
  })

  it('saves a banner colour and only the fields that changed', async () => {
    givenV2({ instagram_handle: 'mei.cooks' })
    const { user } = await renderSettings()

    await user.click(screen.getByRole('button', { name: 'Mint banner' }))
    expect(screen.getByRole('button', { name: 'Mint banner' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'update').payload).toEqual({
      full_name: 'Mei Ling',
      display_name: 'Mei',
      bio: null,
      banner_preset: 'mint',
    })
  })

  it('cleans pasted links and @ off social handles before saving', async () => {
    givenV2()
    const { user } = await renderSettings()

    await user.type(screen.getByLabelText('Instagram'), 'https://www.instagram.com/mei.cooks/')
    await user.type(screen.getByLabelText('TikTok'), '@meicooks')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    const { payload } = supabase.__lastCall('users', 'update')
    expect(payload.instagram_handle).toBe('mei.cooks')
    expect(payload.tiktok_handle).toBe('meicooks')
    expect(screen.getByLabelText('Instagram')).toHaveValue('mei.cooks')
  })

  it('blocks a handle with spaces and says why', async () => {
    givenV2()
    const { user } = await renderSettings()

    await user.type(screen.getByLabelText('Instagram'), 'mei cooks')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Use letters, numbers, full stops or underscores (30 at most).'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Instagram')).toHaveAttribute('aria-invalid', 'true')
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
  })

  it('clears a handle to null', async () => {
    givenV2({ tiktok_handle: 'meicooks' })
    const { user } = await renderSettings()

    await user.clear(screen.getByLabelText('TikTok'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'update').payload.tiktok_handle).toBeNull()
  })

  it('lets a host feature one review or go back to TryKai picking', async () => {
    givenV2()
    givenHostWithReviews([
      { id: 'r1', rating: 5, comment: 'Brilliant', created_at: '2026-10-01T00:00:00Z', listing_title: 'Latte art', users: { full_name: 'Sam' } },
      { id: 'r2', rating: 4, comment: 'Lovely', created_at: '2026-10-05T00:00:00Z', listing_title: 'Latte art', users: { full_name: 'Jo' } },
    ])
    const { user } = await renderSettings()

    const pick = screen.getByRole('radio', { name: /Let TryKai pick/ })
    expect(pick).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Lovely/ }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'update').payload.featured_review_id).toBe('r2')
    expect(supabase.rpc).toHaveBeenCalledWith('reviews_for_host', { p_host_id: USER_ID })
  })

  it('does not show the featured review choice to a guest', async () => {
    givenV2()
    await renderSettings()
    expect(screen.queryByRole('heading', { name: 'Featured review' })).not.toBeInTheDocument()
  })

  it('uploads a cropped banner into the user folder and saves its URL with the form', async () => {
    givenV2({ banner_preset: 'coral' })
    const { user } = await renderSettings()

    fireEvent.change(screen.getByLabelText('Banner photo'), {
      target: { files: [imageFile('wide.png')] },
    })
    expect(await screen.findByText('Crop your banner')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use this crop' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Use this crop' }))

    await waitFor(() => expect(supabase.__bucket('listing-photos').upload).toHaveBeenCalledOnce())
    const uploadedPath = supabase.__bucket('listing-photos').upload.mock.calls[0][0]
    expect(uploadedPath).toMatch(new RegExp(`^${USER_ID}/banner-.+\\.jpg$`))
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Your banner photo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'update').payload.banner_url).toBe(
      `https://cdn.test/listing-photos/${uploadedPath}`,
    )

    await user.click(screen.getByRole('button', { name: 'Use a colour instead' }))
    expect(screen.getByRole('button', { name: 'Coral banner' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('asks before leaving when only the banner changed', async () => {
    givenV2()
    const { user } = await renderSettings({ withNav: true, extraRoutes: <Route path="/" element={<h1>Home</h1>} /> })

    await user.click(screen.getByRole('button', { name: 'Navy banner' }))
    await user.click(screen.getByRole('link', { name: 'TryKai home' }))

    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument()
  })

  it('pins a full-width save bar and lets long reviews wrap inside their card', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    const bar = css.match(/\.edit-profile__bar \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(bar).toMatch(/position:\s*fixed/)
    expect(bar).toMatch(/left:\s*0/)
    expect(bar).toMatch(/right:\s*0/)
    expect(bar).toMatch(/safe-area-inset-bottom/)
    expect(css).toMatch(/body:has\(\.edit-profile__bar\) \.site-footer \{[\s\S]*?margin-bottom/)
    expect(css).toMatch(/\.featured-choices \{[\s\S]*?min-inline-size:\s*0/)
  })
})

describe('Settings day-of contact number', () => {
  it('hides the field from guests', async () => {
    await renderSettings()
    expect(screen.queryByLabelText('Day-of contact number (optional)')).not.toBeInTheDocument()
  })

  it('hides the field before the column exists', async () => {
    givenProfile({ is_host: true })
    await renderSettings()
    expect(screen.queryByLabelText('Day-of contact number (optional)')).not.toBeInTheDocument()
  })

  it('rejects an invalid Singapore number when the host turns sharing on', async () => {
    givenProfile({ is_host: true, share_day_of_phone: false, day_of_phone: null })
    const { user } = await renderSettings()

    expect(screen.getByLabelText('Day-of contact number (optional)')).toBeInTheDocument()
    expect(
      screen.getByText('Show it to confirmed guests from 24 hours before until the session ends.'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByLabelText('Show it to confirmed guests from 24 hours before until the session ends.'),
    )
    await user.type(screen.getByLabelText('Day-of contact number (optional)'), '11111111')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Use an 8-digit Singapore number starting with 3, 6, 8 or 9.'),
    ).toBeInTheDocument()
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
  })

  it('retries a save without the day-of columns when they are missing', async () => {
    givenProfile({ is_host: true, share_day_of_phone: false, day_of_phone: null })
    let updates = 0
    supabase.__on('users', 'update', ({ payload }) => {
      updates += 1
      if (payload.day_of_phone !== undefined) {
        return { data: null, error: { message: 'column users.day_of_phone does not exist' } }
      }
      Object.assign(account, payload)
      return { data: null, error: null }
    })
    const { user } = await renderSettings()
    await user.type(screen.getByLabelText('Day-of contact number (optional)'), '91234567')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updates).toBe(2))
    expect(supabase.__lastCall('users', 'update').payload.day_of_phone).toBeUndefined()
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  })

  it('saves a +65 number and the share toggle', async () => {
    givenProfile({ is_host: true, share_day_of_phone: false, day_of_phone: null })
    const { user } = await renderSettings()

    await user.type(screen.getByLabelText('Day-of contact number (optional)'), '9123 4567')
    await user.click(
      screen.getByLabelText('Show it to confirmed guests from 24 hours before until the session ends.'),
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'update').payload).toMatchObject({
      day_of_phone: '+6591234567',
      share_day_of_phone: true,
    })
  })
})
