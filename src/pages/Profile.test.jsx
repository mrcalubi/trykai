import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Profile from './Profile'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeListing, makeReview } from '../test/fixtures'

vi.mock('../lib/supabase')

const HOST_ID = 'host-1'

function givenProfile(profile = {
  id: HOST_ID,
  display_name: 'Mei',
  full_name: 'Mei Ling Tan',
  avatar_url: null,
  verification_status: 'approved',
}) {
  supabase.__on('users', 'select', { data: profile, error: null })
}

function givenListings(listings) {
  supabase.__on('listings', 'select', { data: listings, error: null })
}

function givenHostReviews(reviews) {
  supabase.rpc.mockImplementation(async (name) => {
    if (name === 'reviews_for_host') return { data: reviews, error: null }
    return { data: null, error: null }
  })
}

function renderPage() {
  return renderWithRouter(<Profile />, {
    route: `/u/${HOST_ID}`,
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
    expect(supabase.auth.getSession).not.toHaveBeenCalled()
  })

  it('does not split a multi-word display name', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Latte Queen',
      full_name: 'Mei Ling Tan',
      avatar_url: null,
      verification_status: 'approved',
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
      'id, display_name, full_name, avatar_url, verification_status'
    )
  })
})
