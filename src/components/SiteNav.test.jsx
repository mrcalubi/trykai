import { screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SiteNav from './SiteNav'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'
import { ACCOUNT_UPDATED_EVENT, notifyAccountUpdated } from '../lib/myAccount'

vi.mock('../lib/supabase')

function signedIn(session = makeAuthSession()) {
  supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null })
}

function givenAccount(row = { display_name: 'Mei Ling', avatar_url: null }) {
  const previous = supabase.rpc.getMockImplementation()
  supabase.rpc.mockImplementation(async (name, args) => {
    if (name === 'my_account') {
      return { data: row ? [row] : [], error: null }
    }
    if (previous) return previous(name, args)
    return { data: null, error: null }
  })
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
    expect(screen.queryByRole('link', { name: 'Your profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument()
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
    givenAccount({ display_name: 'Mei Ling', avatar_url: null })
    renderNav()

    const account = await screen.findByRole('link', { name: 'Your profile' })
    await waitFor(() => expect(account).toHaveTextContent('M'))
    expect(account.querySelector('.ui-topnav__account')).toHaveClass('ui-topnav__account--initials')
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
  })

  it('shows the photo when the profile has an avatar', async () => {
    signedIn()
    givenAccount({ display_name: 'Mei Ling', avatar_url: 'https://cdn.test/avatar.jpg' })
    renderNav()

    const account = await screen.findByRole('link', { name: 'Your profile' })
    await waitFor(() =>
      expect(account.querySelector('.ui-topnav__account')).toHaveClass('ui-topnav__account--photo')
    )
    expect(account.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/avatar.jpg')
  })

  it('shows ? when the profile has no display name', async () => {
    signedIn(makeAuthSession({ user: { email: 'kai@example.com', full_name: null } }))
    givenAccount(null)
    renderNav()

    const account = await screen.findByRole('link', { name: 'Your profile' })
    await waitFor(() => expect(account).toHaveTextContent('?'))
  })

  it('loads the signed-in account through my_account', async () => {
    signedIn(makeAuthSession({ user: { id: 'user-77' } }))
    givenAccount({ display_name: 'Mei Ling', avatar_url: null })
    renderNav()

    await screen.findByRole('link', { name: 'Your profile' })
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('my_account'))
    expect(supabase.__calls('users')).toHaveLength(0)
  })

  it('refetches the face when the account is updated, and drops the listener on unmount', async () => {
    signedIn()
    givenAccount({ display_name: 'Mei', avatar_url: null })
    const { unmount } = renderNav()

    const account = await screen.findByRole('link', { name: 'Your profile' })
    await waitFor(() => expect(account).toHaveTextContent('M'))

    givenAccount({ display_name: 'Mei', avatar_url: 'https://cdn.test/new.jpg' })
    await act(async () => {
      notifyAccountUpdated()
    })
    await waitFor(() =>
      expect(account.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/new.jpg'),
    )

    givenAccount({ display_name: 'Latte Queen', avatar_url: null })
    await act(async () => {
      notifyAccountUpdated()
    })
    await waitFor(() => expect(account).toHaveTextContent('L'))
    expect(account.querySelector('img')).not.toBeInTheDocument()

    const callsAfter = supabase.rpc.mock.calls.filter(([fn]) => fn === 'my_account').length
    unmount()
    await act(async () => {
      window.dispatchEvent(new CustomEvent(ACCOUNT_UPDATED_EVENT))
    })
    expect(supabase.rpc.mock.calls.filter(([fn]) => fn === 'my_account')).toHaveLength(callsAfter)
  })

  it('takes the avatar to the signed-in user own profile', async () => {
    signedIn(makeAuthSession({ user: { id: 'user-77' } }))
    const { user, currentPath } = renderNav()

    await user.click(await screen.findByRole('link', { name: 'Your profile' }))
    await waitFor(() => expect(currentPath()).toBe('/u/user-77'))
  })
})

describe('SiteNav hamburger', () => {
  it('moves the guest destinations into the menu when signed in', async () => {
    signedIn()
    const { user } = renderNav()

    await screen.findByRole('link', { name: 'Your profile' })
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Become a host' })).toHaveAttribute(
      'href',
      '/verify-identity'
    )
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'href',
      `/u/${makeAuthSession().user.id}`
    )
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('link', { name: 'Log out' })).toHaveAttribute('href', '/logout')
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Hosting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create listing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Verification review' })).not.toBeInTheDocument()
  })

  it('sends the hamburger Log out row to /logout without signing out itself', async () => {
    signedIn()
    const { user, currentPath } = renderNav()

    await screen.findByRole('link', { name: 'Your profile' })
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('link', { name: 'Log out' }))

    expect(supabase.auth.signOut).not.toHaveBeenCalled()
    await waitFor(() => expect(currentPath()).toBe('/logout'))
  })

  it('labels Host a session once my_verification reports approved', async () => {
    signedIn()
    supabase.rpc.mockResolvedValue({
      data: [{ verification_status: 'approved', is_admin: false }],
      error: null,
    })
    const { user } = renderNav()

    await screen.findByRole('link', { name: 'Your profile' })
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(await screen.findByRole('link', { name: 'Host a session' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(screen.queryByRole('link', { name: 'Hosting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Become a host' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument()
  })

  it('offers verification review in the menu for an admin', async () => {
    signedIn()
    supabase.rpc.mockResolvedValue({ data: [{ is_admin: true }], error: null })
    const { user } = renderNav()

    await screen.findByRole('link', { name: 'Your profile' })
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(await screen.findByRole('link', { name: 'Verification review' })).toHaveAttribute(
      'href',
      '/admin/verifications'
    )
    expect(supabase.rpc).toHaveBeenCalledWith('my_verification')
  })

  it('does not render verification review when my_verification says the user is not an admin', async () => {
    signedIn()
    supabase.rpc.mockResolvedValue({ data: [{ is_admin: false }], error: null })
    const { user } = renderNav()

    await screen.findByRole('link', { name: 'Your profile' })
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('my_verification'))
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.queryByRole('link', { name: 'Verification review' })).not.toBeInTheDocument()
  })

  it('offers the signed-out menu to a visitor', async () => {
    const { user } = renderNav()

    await screen.findByRole('link', { name: 'Log in' })
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByRole('link', { name: 'Log in or sign up' })).toHaveAttribute(
      'href',
      '/login'
    )
    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Cancellation policy' })).toHaveAttribute(
      'href',
      '/cancellation-policy'
    )
    expect(screen.getByRole('link', { name: 'Refund policy' })).toHaveAttribute(
      'href',
      '/refund-policy'
    )
    expect(screen.getByRole('link', { name: 'Dispute policy' })).toHaveAttribute(
      'href',
      '/dispute-policy'
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

    expect(await screen.findByRole('link', { name: 'Your profile' })).toBeInTheDocument()
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
