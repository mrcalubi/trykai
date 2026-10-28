import { waitFor } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Logout from './Logout'
import { supabase } from '../lib/supabase'
import { renderWithDataRouter } from '../test/render'

vi.mock('../lib/supabase')

beforeEach(() => {
  supabase.__reset()
})

function renderLogout() {
  return renderWithDataRouter(<Logout />, {
    route: '/logout',
    path: '/logout',
    extraRoutes: <Route path="/" element={<h1>Home</h1>} />,
  })
}

describe('Logout', () => {
  it('signs out and replaces the URL with home', async () => {
    const { currentPath } = renderLogout()

    await waitFor(() => expect(currentPath()).toBe('/'))
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })

  it('clears the local session and still goes home when sign-out fails', async () => {
    supabase.auth.signOut.mockImplementation(async (options) =>
      options?.scope === 'local' ? { error: null } : { error: { message: 'network' } },
    )

    const { currentPath } = renderLogout()

    await waitFor(() => expect(currentPath()).toBe('/'))
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
