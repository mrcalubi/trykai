import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequireAuth from './RequireAuth'
import { useAuthedUserId } from '../lib/authedUser'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

function ProtectedPage() {
  return <p>Signed in as {useAuthedUserId()}</p>
}

function givenSignedIn(userId = 'user-1') {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: userId } }) },
    error: null,
  })
}

function renderGuarded(options = {}) {
  return renderWithRouter(
    <RequireAuth>
      <ProtectedPage />
    </RequireAuth>,
    { route: '/dashboard', path: '/dashboard', ...options }
  )
}

beforeEach(() => {
  supabase.__reset()
})

describe('RequireAuth', () => {
  it('holds the page back until the session lookup finishes', () => {
    givenSignedIn()
    renderGuarded()

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument()
  })

  it('hands the signed-in user id to the page it protects', async () => {
    givenSignedIn('host-9')
    renderGuarded()

    expect(await screen.findByText('Signed in as host-9')).toBeInTheDocument()
  })

  it('sends signed-out visitors to log in and remembers where they were going', async () => {
    const { currentPath, currentState } = renderGuarded()

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(currentState().from.pathname).toBe('/dashboard')
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument()
  })

  it('remembers the query string of the page the visitor asked for', async () => {
    const { currentState } = renderGuarded({ route: '/dashboard?booking=booking-1' })

    await waitFor(() => expect(currentState()).not.toBeNull())
    expect(currentState().from.search).toBe('?booking=booking-1')
  })

  // The pinned route unmounts the guard on redirect, which would mask a re-run.
  // Mounting at the catch-all keeps it alive so a second redirect is visible.
  it('keeps the return path when it outlives its own redirect', async () => {
    const { currentPath, currentState } = renderGuarded({
      path: '*',
      outlivesNavigation: true,
    })

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(currentState().from.pathname).toBe('/dashboard')
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1)
  })
})

describe('useAuthedUserId', () => {
  it('refuses to run outside the guard rather than reporting no user', () => {
    // React logs the boundary-less error itself, which is noise here.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<ProtectedPage />)).toThrow(/requires an ancestor <RequireAuth>/)

    consoleError.mockRestore()
  })
})
