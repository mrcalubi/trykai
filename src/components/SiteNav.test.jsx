import { screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SiteNav from './SiteNav'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

function signedIn(session = makeAuthSession()) {
  supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null })
}

// The nav is chrome: it spans routes instead of belonging to one.
function renderNav(options = {}) {
  return renderWithRouter(<SiteNav />, { outlivesNavigation: true, ...options })
}

beforeEach(() => {
  supabase.__reset()
})

describe('SiteNav when signed out', () => {
  it('offers the log in link and keeps host tools out of the bar', async () => {
    renderNav()

    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('Account')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create listing' })).not.toBeInTheDocument()
  })

  it('does not look up a profile it has no user for', async () => {
    renderNav()

    await screen.findByRole('link', { name: 'Log in' })
    expect(supabase.__calls('users')).toHaveLength(0)
  })
})

describe('SiteNav when signed in', () => {
  it('shows initials when the profile has no avatar', async () => {
    signedIn()
    supabase.__on('users', 'select', {
      data: { full_name: 'Mei Ling', avatar_url: null },
      error: null,
    })
    renderNav()

    const account = await screen.findByLabelText('Account')
    await waitFor(() => expect(account).toHaveTextContent('ML'))
    expect(account).toHaveClass('ui-topnav__account--initials')
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
  })

  it('shows the photo when the profile has an avatar', async () => {
    signedIn()
    supabase.__on('users', 'select', {
      data: { full_name: 'Mei Ling', avatar_url: 'https://cdn.test/avatar.jpg' },
      error: null,
    })
    renderNav()

    const account = await screen.findByLabelText('Account')
    await waitFor(() => expect(account).toHaveClass('ui-topnav__account--photo'))
    expect(account.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/avatar.jpg')
  })

  it('falls back to the email initial when the profile has no name', async () => {
    signedIn(makeAuthSession({ user: { email: 'kai@example.com', full_name: null } }))
    supabase.__on('users', 'select', { data: null, error: null })
    renderNav()

    const account = await screen.findByLabelText('Account')
    await waitFor(() => expect(account).toHaveTextContent('K'))
  })

  it('looks the profile up by the signed-in user id', async () => {
    signedIn(makeAuthSession({ user: { id: 'user-77' } }))
    renderNav()

    await screen.findByLabelText('Account')
    await waitFor(() => expect(supabase.__calls('users', 'select')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'select').filters).toContainEqual({
      method: 'eq',
      column: 'id',
      value: 'user-77',
    })
  })
})

describe('SiteNav hamburger', () => {
  it('moves the host and guest destinations into the menu when signed in', async () => {
    signedIn()
    const { user } = renderNav()

    await screen.findByLabelText('Account')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByRole('link', { name: 'Create listing' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: 'Log out' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Verification review' })).not.toBeInTheDocument()
  })

  it('offers verification review in the menu for an admin', async () => {
    signedIn()
    supabase.rpc.mockResolvedValue({ data: [{ is_admin: true }], error: null })
    const { user } = renderNav()

    await screen.findByLabelText('Account')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByRole('link', { name: 'Verification review' })).toHaveAttribute(
      'href',
      '/admin/verifications'
    )
    expect(supabase.rpc).toHaveBeenCalledWith('my_verification')
  })

  it('signs the user out from the menu and sends them home', async () => {
    signedIn()
    const { user, currentPath } = renderNav({ route: '/dashboard' })

    await screen.findByLabelText('Account')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('link', { name: 'Log out' }))

    expect(supabase.auth.signOut).toHaveBeenCalledOnce()
    await waitFor(() => expect(currentPath()).toBe('/'))
  })

  it('offers the signed-out menu to a visitor', async () => {
    const { user } = renderNav()

    await screen.findByRole('link', { name: 'Log in' })
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByRole('link', { name: 'Log in or sign up' })).toHaveAttribute(
      'href',
      '/login'
    )
    expect(screen.queryByRole('link', { name: 'Create listing' })).not.toBeInTheDocument()
  })
})

describe('SiteNav auth subscription', () => {
  it('swaps to the signed-in view when an auth event arrives', async () => {
    let emit
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      emit = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    renderNav()

    await screen.findByRole('link', { name: 'Log in' })

    await act(async () => {
      emit('SIGNED_IN', makeAuthSession())
    })

    expect(await screen.findByLabelText('Account')).toBeInTheDocument()
  })

  it('unsubscribes when it unmounts', async () => {
    const unsubscribe = vi.fn()
    supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } })
    const { unmount } = renderNav()

    await screen.findByRole('link', { name: 'Log in' })
    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
