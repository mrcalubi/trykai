import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { writeBrowseCache } from './lib/browseCache'
import { supabase } from './lib/supabase'
import { makeAuthSession, makeListing } from './test/fixtures'

vi.mock('./lib/supabase')

/**
 * App owns the route table and the persistent chrome. These tests drive the real
 * createBrowserRouter through window.history so a mis-wired path shows up here
 * rather than as a blank page in production.
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

  it('shows a not-found page on an unknown path', async () => {
    renderAt('/does-not-exist')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
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
      await screen.findByRole('heading', {
        level: 1,
        name: "Singapore's not boring. You just haven't found your thing yet.",
      })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('puts a back control on inner pages, not in the top nav', async () => {
    renderAt('/login')

    const back = await screen.findByRole('button', { name: 'Back' })
    expect(back.closest('.page-back')).toBeInTheDocument()
    expect(screen.getByRole('banner').contains(back)).toBe(false)
  })

  it('goes Home from back when there is no in-app previous page', async () => {
    const user = userEvent.setup()
    renderAt('/login')

    await user.click(await screen.findByRole('button', { name: 'Back' }))
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: "Singapore's not boring. You just haven't found your thing yet.",
      })
    ).toBeInTheDocument()
  })

  it('renders the cached browse grid immediately on back to Home', async () => {
    const listing = makeListing({ id: 'l-1', title: 'Latte art' })
    writeBrowseCache({ listings: [listing], ratings: {}, keenCounts: {} })
    supabase.__on('listings', 'select', (record) =>
      record.single
        ? { data: { id: 'l-1', title: 'Latte art', host_id: 'host-1', photo_urls: [] }, error: null }
        : { data: [listing], error: null },
    )
    const user = userEvent.setup()
    renderAt('/')

    expect(screen.getByRole('heading', { name: 'Latte art', level: 3 })).toBeInTheDocument()
    expect(screen.queryByText('Loading listings…')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /Latte art/ }))
    expect(await screen.findByRole('heading', { name: 'Latte art', level: 1 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: "Singapore's not boring. You just haven't found your thing yet.",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Latte art', level: 3 })).toBeInTheDocument()
    expect(screen.queryByText('Loading listings…')).not.toBeInTheDocument()
  })

  it('scrolls a new listing page to the top', async () => {
    const listing = makeListing({ id: 'listing-1', title: 'Latte art' })
    supabase.__on('listings', 'select', (record) =>
      record.single
        ? { data: { id: 'listing-1', title: 'Latte art', host_id: 'host-1', photo_urls: [] }, error: null }
        : { data: [listing], error: null },
    )
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    try {
      renderAt('/')
      await screen.findByRole('link', { name: /Latte art/ })
      scrollTo.mockClear()

      await user.click(screen.getByRole('link', { name: /Latte art/ }))
      expect(await screen.findByRole('heading', { name: 'Latte art', level: 1 })).toBeInTheDocument()
      expect(scrollTo).toHaveBeenCalledWith(0, 0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not scroll to the top when the Home category changes', async () => {
    supabase.__on('listings', 'select', {
      data: [
        makeListing({ id: 'l-1', title: 'Latte art', category: 'Food' }),
        makeListing({ id: 'l-2', title: 'Boxing basics', category: 'Fitness' }),
      ],
      error: null,
    })
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    try {
      renderAt('/')
      await screen.findByText('Latte art')
      scrollTo.mockClear()

      await user.click(screen.getByRole('button', { name: 'Food' }))
      expect(screen.getByRole('heading', { name: 'Latte art' })).toBeInTheDocument()
      expect(screen.queryByText('Boxing basics')).not.toBeInTheDocument()
      expect(scrollTo).not.toHaveBeenCalledWith(0, 0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('restores cached filters on back to Home', async () => {
    const listing = makeListing({ id: 'l-1', title: 'Latte art', category: 'Food' })
    writeBrowseCache({
      listings: [listing, makeListing({ id: 'l-2', title: 'Boxing basics', category: 'Fitness' })],
      ratings: {},
      keenCounts: {},
      filters: { category: 'Food', region: 'All', area: '', quick: null },
    })
    supabase.__on('listings', 'select', (record) =>
      record.single
        ? { data: { id: 'l-1', title: 'Latte art', host_id: 'host-1', photo_urls: [] }, error: null }
        : { data: [listing], error: null },
    )
    const user = userEvent.setup()
    renderAt('/')

    expect(screen.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('link', { name: /Latte art/ }))
    expect(await screen.findByRole('heading', { name: 'Latte art', level: 1 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Loading listings…')).not.toBeInTheDocument()
  })

  it('opens a fresh All browse page at the top from the logo', async () => {
    const listing = makeListing({ id: 'l-1', title: 'Latte art', category: 'Food' })
    writeBrowseCache({
      listings: [listing, makeListing({ id: 'l-2', title: 'Boxing basics', category: 'Fitness' })],
      ratings: {},
      keenCounts: {},
      filters: { category: 'Food', region: 'All', area: '', quick: null },
    })
    supabase.__on('listings', 'select', (record) =>
      record.single
        ? { data: { id: 'l-1', title: 'Latte art', host_id: 'host-1', photo_urls: [] }, error: null }
        : { data: [listing], error: null },
    )
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    try {
      renderAt('/')
      expect(screen.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true')
      await user.click(await screen.findByRole('link', { name: /Latte art/ }))
      expect(await screen.findByRole('heading', { name: 'Latte art', level: 1 })).toBeInTheDocument()
      scrollTo.mockClear()

      await user.click(screen.getByRole('link', { name: 'TryKai home' }))
      expect(await screen.findByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('heading', { name: 'Latte art', level: 3 })).toBeInTheDocument()
      expect(screen.queryByText('Loading listings…')).not.toBeInTheDocument()
      expect(scrollTo).toHaveBeenCalledWith(0, 0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('uses in-app history for back after navigating inside the app', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await screen.findByRole('heading', {
      level: 1,
      name: "Singapore's not boring. You just haven't found your thing yet.",
    })

    await user.click(screen.getByRole('link', { name: 'Refund Policy' }))
    expect(await screen.findByRole('heading', { name: 'Refund Policy' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: "Singapore's not boring. You just haven't found your thing yet.",
      })
    ).toBeInTheDocument()
  })

  it('serves the login page', async () => {
    renderAt('/login')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('serves forgot-password without requiring a session', async () => {
    renderAt('/forgot-password')

    expect(await screen.findByRole('heading', { name: 'Forgot password' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/forgot-password')
  })

  it('serves reset-password without requiring a session', async () => {
    renderAt('/reset-password')

    expect(await screen.findByRole('heading', { name: 'Reset password' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/reset-password')
  })

  it.each([
    ['/refund-policy', 'Refund Policy'],
    ['/cancellation-policy', 'Cancellation Policy'],
    ['/dispute-policy', 'Dispute Policy'],
    ['/terms', 'Terms of Service'],
    ['/privacy', 'Privacy Policy'],
    ['/style-guide', 'Component preview'],
  ])('serves %s', async (path, heading) => {
    renderAt(path)

    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
  })

  it('serves a public profile without requiring a session', async () => {
    supabase.__on('users', 'select', {
      data: {
        id: 'host-1',
        display_name: 'Mei',
        avatar_url: null,
        is_id_verified: true,
      },
      error: null,
    })
    renderAt('/u/host-1')

    expect(await screen.findByRole('heading', { name: 'Mei', level: 1 })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/u/host-1')
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

  it('sends a signed-out visitor from bookings to login', async () => {
    renderAt('/bookings')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('sends a signed-out visitor from a booking detail to login', async () => {
    renderAt('/bookings/booking-1')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('sends a signed-out visitor from hosting to login', async () => {
    renderAt('/hosting')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('sends a signed-out visitor from settings to login', async () => {
    renderAt('/settings')

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

  it('sends a signed-out visitor from verification review to login', async () => {
    renderAt('/admin/verifications')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('refuses a signed-in host who is not an admin', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: makeAuthSession() },
      error: null,
    })
    supabase.rpc.mockResolvedValue({ data: [{ is_admin: false }], error: null })
    renderAt('/admin/verifications')

    expect(await screen.findByText('This page is for the TryKai team only.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Verification review' })).not.toBeInTheDocument()
  })
})
