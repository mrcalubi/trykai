import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import RequireAuth from '../components/RequireAuth'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

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

describe('Settings access', () => {
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

  it('loads the form from users when my_account is not deployed yet', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.my_account without parameters in the schema cache',
      },
    })
    supabase.__on('users', 'select', {
      data: {
        email: 'mei@example.com',
        full_name: 'Mei Ling',
        display_name: 'Mei',
        bio: 'I pull rosettas.',
        avatar_url: null,
      },
      error: null,
    })

    renderWithRouter(
      <RequireAuth>
        <Settings />
      </RequireAuth>,
      { route: '/settings', path: '/settings' }
    )

    expect(await screen.findByLabelText('Display name')).toHaveValue('Mei')
    expect(screen.getByLabelText('Full name')).toHaveValue('Mei Ling')
    expect(screen.getByLabelText('About you')).toHaveValue('I pull rosettas.')
    expect(screen.getByLabelText('Email')).toHaveValue('mei@example.com')
    expect(
      screen.queryByText('Something went wrong loading this page. Please refresh.')
    ).not.toBeInTheDocument()
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
    expect(await screen.findByText('Your profile has been saved.')).toBeInTheDocument()
  })

  it('uploads a new photo and writes its public URL to avatar_url', async () => {
    await renderSettings()
    fireEvent.change(screen.getByLabelText('Profile photo'), {
      target: { files: [imageFile('face.png')] },
    })

    await screen.getByRole('button', { name: 'Save changes' }).click()

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__bucket('listing-photos').upload).toHaveBeenCalledOnce()
    const uploadedPath = supabase.__bucket('listing-photos').upload.mock.calls[0][0]
    expect(uploadedPath).toMatch(new RegExp(`^${USER_ID}/avatar-.+\\.png$`))
    expect(supabase.__lastCall('users', 'update').payload).toEqual({
      full_name: 'Mei Ling',
      display_name: 'Mei',
      bio: null,
      avatar_url: `https://cdn.test/listing-photos/${uploadedPath}`,
    })
  })

  it('keeps the existing photo when none is chosen', async () => {
    givenProfile({ avatar_url: 'https://cdn.test/existing.jpg' })
    const { user } = await renderSettings()

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
    await renderSettings()
    supabase
      .__bucket('listing-photos')
      .upload.mockResolvedValue({ data: null, error: { message: 'storage full' } })
    fireEvent.change(screen.getByLabelText('Profile photo'), {
      target: { files: [imageFile()] },
    })

    await screen.getByRole('button', { name: 'Save changes' }).click()

    expect(await screen.findByText('storage full')).toBeInTheDocument()
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
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

    expect(await screen.findByText('not allowed')).toBeInTheDocument()
    expect(screen.queryByText('Your profile has been saved.')).not.toBeInTheDocument()
  })
})
