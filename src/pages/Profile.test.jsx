import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Profile from './Profile'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession, makeListing, makeReview } from '../test/fixtures'

vi.mock('../lib/supabase')

const HOST_ID = 'host-1'
const OTHER_ID = 'user-99'

function givenProfile(profile = {
  id: HOST_ID,
  display_name: 'Mei',
  full_name: 'Mei Ling Tan',
  avatar_url: null,
  verification_status: 'approved',
  is_host: true,
}) {
  supabase.__on('users', 'select', { data: profile, error: null })
}

function givenListings(listings) {
  supabase.__on('listings', 'select', { data: listings, error: null })
}

function givenRpcs({ hostReviews = [], listingRatings = [] } = {}) {
  supabase.rpc.mockImplementation(async (name) => {
    if (name === 'reviews_for_host') return { data: hostReviews, error: null }
    if (name === 'listing_ratings') return { data: listingRatings, error: null }
    return { data: null, error: null }
  })
}

function givenHostReviews(reviews) {
  givenRpcs({ hostReviews: reviews })
}

function givenSignedIn(userId = HOST_ID) {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: userId } }) },
    error: null,
  })
}

function renderPage({ userId = HOST_ID, search = '' } = {}) {
  return renderWithRouter(<Profile />, {
    route: `/u/${userId}${search}`,
    path: '/u/:id',
  })
}

beforeEach(() => {
  supabase.__reset()
  givenProfile()
  givenListings([])
  givenHostReviews([])
})

describe('Profile loading and failure', () => {
  it('shows a loading message first', () => {
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows the error and a way back when the profile cannot be loaded', async () => {
    supabase.__on('users', 'select', { data: null, error: { message: 'not found' } })
    renderPage()

    expect(await screen.findByText('not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to listings' })).toHaveAttribute('href', '/')
  })
})

describe('Profile public content', () => {
  it('shows the display name, even when signed out', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Mei', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('Mei Ling Tan')).not.toBeInTheDocument()
    expect(supabase.auth.getSession).toHaveBeenCalled()
    expect(screen.queryByRole('navigation', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('does not split a multi-word display name', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Latte Queen',
      full_name: 'Mei Ling Tan',
      avatar_url: null,
      verification_status: 'approved',
      is_host: true,
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Latte Queen', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('Mei')).not.toBeInTheDocument()
  })

  it('falls back to the first name when display_name is empty', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: '',
      full_name: 'Mei Ling Tan',
      avatar_url: null,
      verification_status: 'approved',
      is_host: true,
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Mei', level: 1 })).toBeInTheDocument()
  })

  it('shows the ID verified badge only when the host is approved', async () => {
    renderPage()
    expect(await screen.findByText('ID verified')).toBeInTheDocument()
  })

  it('hides the ID verified badge when the host is not approved', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      full_name: 'Mei Ling',
      avatar_url: null,
      verification_status: 'pending',
      is_host: true,
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(screen.queryByText('ID verified')).not.toBeInTheDocument()
  })

  it('averages reviews they received as a host and hides the rating when there are none', async () => {
    givenHostReviews([])
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.detail-host__rating')).not.toBeInTheDocument()
    expect(screen.getByText('No reviews yet.')).toBeInTheDocument()
  })

  it('rates the host from every listing they have reviews on', async () => {
    givenHostReviews([
      makeReview({ id: 'r1', rating: 5, listing_title: 'Latte art' }),
      makeReview({ id: 'r2', rating: 4, listing_title: 'Pour over' }),
    ])
    renderPage()

    expect(await screen.findByText('4.5 · 2 reviews')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reviews (2)' })).toBeInTheDocument()
  })

  it('loads reviews through reviews_for_host, not a bookings embed', async () => {
    givenHostReviews([makeReview({ listing_title: 'Latte art' })])
    renderPage()

    await screen.findByText('Wonderful host.')
    expect(supabase.rpc).toHaveBeenCalledWith('reviews_for_host', { p_host_id: HOST_ID })
    expect(supabase.__calls('reviews', 'select')).toHaveLength(0)
    expect(supabase.__calls('bookings', 'select')).toHaveLength(0)
  })

  it('shows the listing title on each review they received', async () => {
    givenHostReviews([
      makeReview({
        comment: 'Great class',
        listing_title: 'Learn latte art with me',
        users: { full_name: 'Arun' },
      }),
    ])
    renderPage()

    expect(await screen.findByText('Great class')).toBeInTheDocument()
    expect(screen.getByText('Learn latte art with me')).toBeInTheDocument()
    expect(screen.getByText('Arun')).toBeInTheDocument()
  })

  it('lists active listings with the browse card', async () => {
    givenListings([
      makeListing({
        id: 'listing-9',
        title: 'Latte art',
        category: 'Food',
        price_per_person: 4500,
      }),
    ])
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Latte art', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Latte art/ })).toHaveAttribute(
      'href',
      '/listings/listing-9'
    )
    expect(screen.getByText(/\$51\/person/)).toBeInTheDocument()
  })

  it('rates a listing card only when listing_ratings returns reviews', async () => {
    givenListings([
      makeListing({
        id: 'listing-9',
        title: 'Latte art',
        category: 'Food',
        price_per_person: 4500,
      }),
      makeListing({
        id: 'listing-8',
        title: 'Pour over',
        category: 'Food',
        price_per_person: 4500,
      }),
    ])
    givenRpcs({
      listingRatings: [{ listing_id: 'listing-9', average: 4.8, review_count: 12 }],
    })
    renderPage()

    const latte = await screen.findByRole('link', { name: /Latte art/ })
    expect(latte.textContent).toContain('$51/person · ★ 4.8 (12)')
    const pourOver = screen.getByRole('link', { name: /Pour over/ })
    expect(pourOver.textContent).not.toContain('★')
  })

  it('asks listing_ratings once for the listings on the profile', async () => {
    givenListings([
      makeListing({ id: 'listing-9', title: 'Latte art' }),
      makeListing({ id: 'listing-8', title: 'Pour over' }),
    ])
    renderPage()
    await screen.findByRole('heading', { name: 'Latte art', level: 3 })

    const ratingCalls = supabase.rpc.mock.calls.filter(([name]) => name === 'listing_ratings')
    expect(ratingCalls).toHaveLength(1)
    expect(ratingCalls[0][1]).toEqual({ listing_ids: ['listing-9', 'listing-8'] })
  })

  it('scopes listings to this host and to active rows', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })

    expect(supabase.__lastCall('listings', 'select').filters).toEqual(
      expect.arrayContaining([
        { method: 'eq', column: 'host_id', value: HOST_ID },
        { method: 'eq', column: 'is_active', value: true },
      ])
    )
  })

  it('does not select email or other private user columns', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })

    expect(supabase.__lastCall('users', 'select').chain[0].args[0]).toBe(
      'id, display_name, full_name, avatar_url, verification_status, is_host'
    )
  })
})

describe('Profile own tabs', () => {
  beforeEach(() => {
    givenSignedIn(HOST_ID)
  })

  it('shows private tabs and a settings gear on your own profile', async () => {
    renderPage()

    expect(await screen.findByRole('navigation', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bookings' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'Hosting' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Listings' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reviews' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(await screen.findByRole('heading', { name: 'My Bookings' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('keeps Bookings as the default tab and writes it into tab links', async () => {
    renderPage()

    await screen.findByRole('link', { name: 'Bookings' })
    expect(screen.getByRole('link', { name: 'Bookings' })).toHaveAttribute(
      'href',
      `/u/${HOST_ID}?tab=bookings`
    )
    expect(screen.getByRole('link', { name: 'Hosting' })).toHaveAttribute(
      'href',
      `/u/${HOST_ID}?tab=hosting`
    )
  })

  it('opens the hosting panel from ?tab=hosting', async () => {
    renderPage({ search: '?tab=hosting' })

    expect(await screen.findByRole('heading', { name: 'My Listings' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hosting' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.queryByRole('heading', { name: 'My Bookings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('keeps other query keys when switching tabs', async () => {
    renderPage({ search: '?booking=booking-1&tab=bookings' })

    await screen.findByRole('link', { name: 'Listings' })
    expect(screen.getByRole('link', { name: 'Listings' })).toHaveAttribute(
      'href',
      `/u/${HOST_ID}?booking=booking-1&tab=listings`
    )
  })

  it('falls back to bookings when the tab is unknown', async () => {
    renderPage({ search: '?tab=not-a-tab' })

    expect(await screen.findByRole('heading', { name: 'My Bookings' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bookings' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('hides Hosting and prompts Become a host on a non-host own Listings tab', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      full_name: 'Mei Ling Tan',
      avatar_url: null,
      verification_status: 'approved',
      is_host: false,
    })
    const { user } = renderPage({ search: '?tab=listings' })

    await screen.findByRole('navigation', { name: 'Profile' })
    expect(screen.queryByRole('link', { name: 'Hosting' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Become a host' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(screen.queryByText('No listings yet.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Bookings' }))
    expect(await screen.findByRole('heading', { name: 'My Bookings' })).toBeInTheDocument()
  })

  it('treats ?tab=hosting as bookings when the owner is not a host', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      full_name: 'Mei Ling Tan',
      avatar_url: null,
      verification_status: 'approved',
      is_host: false,
    })
    renderPage({ search: '?tab=hosting' })

    expect(await screen.findByRole('heading', { name: 'My Bookings' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My Listings' })).not.toBeInTheDocument()
  })
})

describe('Profile of another user', () => {
  it('shows no private tabs and no gear', async () => {
    givenSignedIn(OTHER_ID)
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(screen.queryByRole('navigation', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Bookings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Hosting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Listings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reviews' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My Bookings' })).not.toBeInTheDocument()
  })
})
