import { screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Navbar from './Navbar'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

function signedIn(session = makeAuthSession()) {
  supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null })
}

beforeEach(() => {
  supabase.__reset()
})

describe('Navbar when signed out', () => {
  it('offers a login link and nothing else', async () => {
    renderWithRouter(<Navbar />)

    expect(await screen.findByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument()
  })

  it('does not look up a profile it has no user for', async () => {
    renderWithRouter(<Navbar />)

    await screen.findByRole('link', { name: 'Login' })
    expect(supabase.__calls('users')).toHaveLength(0)
  })
})

describe('Navbar when signed in', () => {
  it('shows the host and guest entry points', async () => {
    signedIn()
    renderWithRouter(<Navbar />)

    expect(await screen.findByRole('link', { name: 'Create listing' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument()
  })

  // The avatar mounts before the profile query resolves, so these assertions
  // have to wait for the name to land rather than read it on first paint.
  async function avatarInitial() {
    const avatar = await screen.findByRole('button', { name: 'Account menu' })
    await waitFor(() => expect(supabase.__calls('users', 'select').length).toBeGreaterThan(0))
    return avatar
  }

  it('uses the first letter of the profile name for the avatar', async () => {
    signedIn()
    supabase.__on('users', 'select', { data: { full_name: 'mei ling' }, error: null })
    renderWithRouter(<Navbar />)

    const avatar = await avatarInitial()
    await waitFor(() => expect(avatar).toHaveTextContent('M'))
  })

  it('falls back to the email initial when the profile has no name', async () => {
    signedIn(makeAuthSession({ user: { email: 'kai@example.com', full_name: null } }))
    supabase.__on('users', 'select', { data: { full_name: null }, error: null })
    renderWithRouter(<Navbar />)

    const avatar = await avatarInitial()
    await waitFor(() => expect(avatar).toHaveTextContent('K'))
  })

  it('falls back to a question mark when there is neither a name nor an email', async () => {
    signedIn(makeAuthSession({ user: { email: undefined, full_name: null } }))
    supabase.__on('users', 'select', { data: null, error: null })
    renderWithRouter(<Navbar />)

    const avatar = await avatarInitial()
    await waitFor(() => expect(avatar).toHaveTextContent('?'))
  })

  it('looks the profile up by the signed-in user id', async () => {
    signedIn(makeAuthSession({ user: { id: 'user-77' } }))
    renderWithRouter(<Navbar />)

    await screen.findByRole('button', { name: 'Account menu' })
    await waitFor(() => expect(supabase.__calls('users', 'select')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'select').filters).toContainEqual({
      method: 'eq',
      column: 'id',
      value: 'user-77',
    })
  })
})

describe('Navbar account menu', () => {
  it('reveals logout only after the avatar is clicked', async () => {
    signedIn()
    const { user } = renderWithRouter(<Navbar />)

    const avatar = await screen.findByRole('button', { name: 'Account menu' })
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument()

    await user.click(avatar)
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })

  it('closes when the user clicks outside it', async () => {
    signedIn()
    const { user } = renderWithRouter(<Navbar />)

    await user.click(await screen.findByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()

    await user.click(document.body)
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument()
  })

  it('signs the user out and sends them home', async () => {
    signedIn()
    const { user, currentPath } = renderWithRouter(<Navbar />, { route: '/dashboard' })

    await user.click(await screen.findByRole('button', { name: 'Account menu' }))
    await user.click(screen.getByRole('button', { name: 'Logout' }))

    expect(supabase.auth.signOut).toHaveBeenCalledOnce()
    await waitFor(() => expect(currentPath()).toBe('/'))
  })
})

describe('Navbar auth subscription', () => {
  it('swaps to the signed-in view when an auth event arrives', async () => {
    let emit
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      emit = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    renderWithRouter(<Navbar />)

    await screen.findByRole('link', { name: 'Login' })

    await act(async () => {
      emit('SIGNED_IN', makeAuthSession())
    })

    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('unsubscribes when it unmounts', async () => {
    const unsubscribe = vi.fn()
    supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } })
    const { unmount } = renderWithRouter(<Navbar />)

    await screen.findByRole('link', { name: 'Login' })
    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
