import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { supabase } from './lib/supabase'

vi.mock('./lib/supabase')

/**
 * App owns the route table and the persistent chrome. These tests drive the real
 * BrowserRouter through window.history so a mis-wired path shows up here rather
 * than as a blank page in production.
 */

function renderAt(path) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

beforeEach(() => {
  supabase.__reset()
})

afterEach(() => {
  window.history.pushState({}, '', '/')
})

describe('App chrome', () => {
  it('shows the top nav and footer on every page', async () => {
    renderAt('/')

    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Refund Policy' })).toBeInTheDocument()
  })

  it('keeps the chrome on an unknown path', async () => {
    renderAt('/does-not-exist')

    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dispute Policy' })).toBeInTheDocument()
  })

  it('mounts exactly one nav on the style-guide route', async () => {
    renderAt('/style-guide')

    expect(await screen.findByRole('heading', { name: 'Component preview' })).toBeInTheDocument()
    expect(screen.getAllByRole('banner')).toHaveLength(1)
  })
})

describe('App routes', () => {
  it('serves the browse page at the root', async () => {
    renderAt('/')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Browse skills' })
    ).toBeInTheDocument()
  })

  it('serves the login page', async () => {
    renderAt('/login')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it.each([
    ['/refund-policy', 'Refund Policy'],
    ['/cancellation-policy', 'Cancellation Policy'],
    ['/dispute-policy', 'Dispute Policy'],
    ['/style-guide', 'Component preview'],
  ])('serves %s', async (path, heading) => {
    renderAt(path)

    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
  })

  it('serves a listing detail page for a listing id', async () => {
    supabase.__on('listings', 'select', {
      data: { id: 'listing-1', title: 'Latte art', host_id: 'host-1', photo_urls: [] },
      error: null,
    })
    renderAt('/listings/listing-1')

    expect(await screen.findByRole('heading', { name: 'Latte art', level: 1 })).toBeInTheDocument()
  })

  it('sends a signed-out visitor from a host-only route to login', async () => {
    renderAt('/create-listing')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('sends a signed-out visitor from the dashboard to login', async () => {
    renderAt('/dashboard')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('sends a signed-out visitor from verification to login', async () => {
    renderAt('/verify-identity')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('sends a signed-out visitor from the edit page to login', async () => {
    renderAt('/edit-listing/listing-1')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
})
