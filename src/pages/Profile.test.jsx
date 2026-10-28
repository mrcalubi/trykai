import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Profile from './Profile'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { hoursFromNow, makeAuthSession, makeBooking, makeListing, makeReview, makeSession } from '../test/fixtures'
vi.mock('../lib/supabase')

const HOST_ID = 'host-1'
const OTHER_ID = 'user-99'

let lastProfile = null

function givenProfile(profile = {
  id: HOST_ID,
  display_name: 'Mei',
  bio: null,
  avatar_url: null,
  is_id_verified: true,
  is_host: true,
  stripe_payouts_enabled: true,
}) {
  lastProfile = profile
  supabase.__on('users', 'select', { data: profile, error: null })
}

function givenListings(listings) {
  supabase.__on('listings', 'select', { data: listings, error: null })
}

function givenSessions(sessions) {
  supabase.__on('sessions', 'select', { data: sessions, error: null })
}

function givenBookings(bookings) {
  supabase.__on('bookings', 'select', { data: bookings, error: null })
  supabase.__on('reviews', 'select', { data: [], error: null })
}

function givenRpcs({
  hostReviews = [],
  listingRatings = [],
  account,
  sessionsHeld = 0,
  founding = false,
  stats = null,
} = {}) {
  const fallbackAccount = lastProfile
    ? {
        display_name: lastProfile.display_name,
        bio: lastProfile.bio,
        avatar_url: lastProfile.avatar_url,
        is_host: lastProfile.is_host,
        verification_status:
          lastProfile.verification_status ??
          (lastProfile.is_id_verified ? 'approved' : 'unverified'),
        stripe_payouts_enabled: lastProfile.stripe_payouts_enabled ?? true,
      }
    : null
  supabase.rpc.mockImplementation(async (name) => {
    if (name === 'reviews_for_host') return { data: hostReviews, error: null }
    if (name === 'listing_ratings') return { data: listingRatings, error: null }
    if (name === 'host_sessions_held') return { data: sessionsHeld, error: null }
    if (name === 'host_is_founding') return { data: founding, error: null }
    if (name === 'my_profile_stats') return { data: stats ? [stats] : [], error: null }
    if (name === 'my_account') {
      const row = account === undefined ? fallbackAccount : account
      return { data: row ? [row] : [], error: null }
    }
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

    expect(
      await screen.findByText('Something went wrong loading this page. Please refresh.')
    ).toBeInTheDocument()
    expect(screen.queryByText('not found')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to listings' })).toHaveAttribute('href', '/')
  })

  it('loads the profile when is_id_verified is not in the database yet', async () => {
    supabase.__on('users', 'select', (call) => {
      const columns = call.chain.find((step) => step.method === 'select')?.args[0] ?? ''
      if (String(columns).includes('is_id_verified')) {
        return {
          data: null,
          error: { code: '42703', message: 'column users.is_id_verified does not exist' },
        }
      }
      return {
        data: {
          id: HOST_ID,
          display_name: 'Mei',
          bio: null,
          avatar_url: null,
          is_host: true,
        },
        error: null,
      }
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Mei', level: 1 })).toBeInTheDocument()
    expect(
      screen.queryByText('Something went wrong loading this page. Please refresh.')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('ID verified')).not.toBeInTheDocument()
    const selects = supabase.__calls('users', 'select').map((call) => call.chain[0].args[0])
    expect(selects).toEqual([
      'id, display_name, bio, avatar_url, is_host, stripe_payouts_enabled, is_id_verified, banner_preset, banner_url, featured_review_id, instagram_handle, tiktok_handle',
      'id, display_name, bio, avatar_url, is_host, stripe_payouts_enabled, is_id_verified',
      'id, display_name, bio, avatar_url, is_host, stripe_payouts_enabled',
    ])
  })

  it('retries without the badge column when the grant is missing', async () => {
    supabase.__on('users', 'select', (call) => {
      const columns = call.chain.find((step) => step.method === 'select')?.args[0] ?? ''
      if (String(columns).includes('is_id_verified')) {
        return {
          data: null,
          error: { code: '42501', message: 'permission denied for table users' },
        }
      }
      return {
        data: {
          id: HOST_ID,
          display_name: 'Mei',
          bio: 'I pull rosettas.',
          avatar_url: null,
          is_host: true,
        },
        error: null,
      }
    })
    renderPage()

    expect(await screen.findByText('I pull rosettas.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'About' })).not.toBeInTheDocument()
    expect(
      screen.queryByText('Something went wrong loading this page. Please refresh.')
    ).not.toBeInTheDocument()
  })

  it('keeps the ID verified badge from my_account when the public column is missing', async () => {
    givenSignedIn(HOST_ID)
    supabase.__on('users', 'select', (call) => {
      const columns = call.chain.find((step) => step.method === 'select')?.args[0] ?? ''
      if (String(columns).includes('is_id_verified')) {
        return {
          data: null,
          error: { message: "Could not find the 'is_id_verified' column of 'users' in the schema cache" },
        }
      }
      return {
        data: {
          id: HOST_ID,
          display_name: 'Mei',
          bio: null,
          avatar_url: null,
          is_host: false,
        },
        error: null,
      }
    })
    givenRpcs({
      account: {
        display_name: 'Mei',
        bio: null,
        avatar_url: null,
        is_host: false,
        verification_status: 'approved',
        stripe_payouts_enabled: false,
      },
    })
    renderPage()

    expect(await screen.findByText('ID verified')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Profile' })).toBeInTheDocument()
  })
})

describe('Profile public content', () => {
  it('shows the display name, even when signed out', async () => {
    const { user } = renderPage()

    expect(await screen.findByRole('heading', { name: 'Mei', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('Mei Ling Tan')).not.toBeInTheDocument()
    expect(supabase.auth.getSession).toHaveBeenCalled()
    expect(screen.queryByRole('navigation', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '⚑ Report' })).not.toBeInTheDocument()
    const more = screen.getByRole('button', { name: 'More actions' })
    expect(more.closest('.profile-header__tools')).toBeInTheDocument()
    await user.click(more)
    const report = screen.getByRole('menuitem', { name: 'Report profile' })
    expect(decodeURIComponent(report.getAttribute('href'))).toContain('Report: profile Mei')
    expect(decodeURIComponent(report.getAttribute('href'))).toContain(HOST_ID)
  })

  it('does not split a multi-word display name', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Latte Queen',
      avatar_url: null,
      is_id_verified: true,
      is_host: true,
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Latte Queen', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('Mei')).not.toBeInTheDocument()
  })

  it('shows Anonymous when display_name is empty', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: '',
      avatar_url: null,
      is_id_verified: true,
      is_host: true,
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Anonymous', level: 1 })).toBeInTheDocument()
    expect(document.querySelector('.detail-host__avatar')).toHaveTextContent('?')
  })

  it('shows the ID verified badge only when the host is approved', async () => {
    renderPage()
    expect(await screen.findByText('ID verified')).toBeInTheDocument()
  })

  it('hides the ID verified badge when the host is not approved', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      avatar_url: null,
      is_id_verified: false,
      is_host: true,
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(screen.queryByText('ID verified')).not.toBeInTheDocument()
  })

  it('averages reviews they received as a host and hides the rating when there are none', async () => {
    givenHostReviews([])
    givenListings([makeListing({ id: 'listing-9', category: 'Food' })])
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__star')).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header__facts')).not.toHaveTextContent('reviews')
    expect(screen.getByText('No reviews yet.')).toBeInTheDocument()
  })

  it('rates the host from every listing they have reviews on', async () => {
    givenListings([
      makeListing({ id: 'listing-9', category: 'Food' }),
      makeListing({ id: 'listing-8', category: 'Music' }),
    ])
    givenHostReviews([
      makeReview({ id: 'r1', rating: 5, listing_title: 'Latte art' }),
      makeReview({ id: 'r2', rating: 4, listing_title: 'Pour over' }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: /^Reviews\s*4\.5 ★\s*2 reviews$/ })
    const stats = screen.getByTestId('profile-stats')
    expect(stats).toHaveTextContent('4.5 ★')
    expect(stats).toHaveTextContent('2 reviews')
  })

  it('loads reviews through reviews_for_host, not a bookings embed', async () => {
    givenHostReviews([makeReview({ listing_title: 'Latte art' })])
    renderPage()

    await screen.findAllByText('Wonderful host.')
    expect(supabase.rpc).toHaveBeenCalledWith('reviews_for_host', { p_host_id: HOST_ID })
    expect(supabase.__calls('reviews', 'select')).toEqual([
      expect.objectContaining({
        filters: expect.arrayContaining([
          expect.objectContaining({ method: 'in', column: 'id' }),
        ]),
      }),
    ])
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

    const reviews = await screen.findByRole('region', { name: 'Reviews' })
    expect(await within(reviews).findByText('Great class')).toBeInTheDocument()
    expect(within(reviews).getByText('Learn latte art with me')).toBeInTheDocument()
    expect(within(reviews).getByText('Arun')).toBeInTheDocument()
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
    expect(latte.textContent).toContain('$51/person')
    expect(latte.textContent).toContain('★ 4.8 (12)')
    expect(latte.textContent).not.toContain('·')
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
        { method: 'eq', column: 'review_status', value: 'approved' },
      ])
    )
  })

  it('does not select email or other private user columns', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })

    const columns = supabase.__lastCall('users', 'select').chain[0].args[0]
    expect(columns).toBe(
      'id, display_name, bio, avatar_url, is_host, stripe_payouts_enabled, is_id_verified, banner_preset, banner_url, featured_review_id, instagram_handle, tiktok_handle'
    )
    expect(columns).not.toMatch(/email|full_name|phone|created_at|is_founding_host/)
  })

  it('shows the bio in the header card when it exists, even when signed out', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      bio: 'I pull rosettas.\nAlso pour-overs.',
      avatar_url: null,
      is_id_verified: true,
      is_host: true,
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header .detail-host__bio').textContent).toBe(
      'I pull rosettas.\nAlso pour-overs.',
    )
    expect(screen.queryByRole('heading', { name: 'About' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add a short bio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Profile' })).not.toBeInTheDocument()
  })

  it('hides the bio for other people when there is none', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header .detail-host__bio')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'About' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'About' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add a short bio' })).not.toBeInTheDocument()
  })

  it('clamps a long bio to three lines with … more and Less', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      bio: 'One.\nTwo.\nThree.\nFour.',
      avatar_url: null,
      is_id_verified: true,
      is_host: true,
    })
    const { user } = renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    const bio = document.querySelector('.profile-header .detail-host__bio')
    expect(bio.textContent).toBe('One.\nTwo.\nThree.… more')
    expect(screen.getByRole('button', { name: '… more' })).toHaveAttribute('aria-expanded', 'false')

    await user.click(screen.getByRole('button', { name: '… more' }))
    expect(bio.textContent).toBe('One.\nTwo.\nThree.\nFour.Less')
    expect(screen.getByRole('button', { name: 'Less' })).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: 'Less' }))
    expect(bio.textContent).toBe('One.\nTwo.\nThree.… more')
  })

  it('keeps typed line breaks and wraps long words in the bio', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(
      /\.profile-about__body,\s*\n\.detail-host__bio,\s*\n\.profile-header__name,[\s\S]*?\{\s*\n\s*overflow-wrap:\s*break-word/
    )
    expect(css).toMatch(
      /\.detail-description,\s*\n\.profile-about__body,\s*\n\.detail-host__bio \{[\s\S]*?white-space:\s*pre-wrap/
    )
  })

  it('lays the card out per profile v2 and keeps the 1120px page', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/\.profile-banner \{[\s\S]*?height:\s*120px/)
    expect(css).toMatch(/\.profile-banner \{[\s\S]*?height:\s*176px/)
    expect(css).toMatch(/\.profile-banner \{[\s\S]*?background:\s*var\(--banner-bg, var\(--sand\)\)/)
    expect(css).toMatch(/\.profile-header__face \{[\s\S]*?width:\s*132px/)
    expect(css).toMatch(/\.profile-header__face \{[\s\S]*?box-shadow:\s*0 0 0 5px var\(--surface\)/)
    expect(css).toMatch(/\.profile-header__identity \{[\s\S]*?margin-top:\s*-66px/)
    expect(css).toMatch(/\.profile-header__avatar \{[\s\S]*?z-index:\s*1/)
    expect(css).toMatch(/\.stat-grid--4 \{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
    expect(css).toMatch(/\.profile-header__body \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 320px/)
    expect(css).toMatch(/\.profile-tab-layout \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 340px/)
    expect(css).toMatch(/\.page--profile \{[\s\S]*?max-width:\s*1120px/)
    expect(css).toMatch(/\.page--detail \{[\s\S]*?max-width:\s*1120px/)
    expect(css).toMatch(/\.profile-header__icon-btn \{[\s\S]*?width:\s*44px/)
    expect(css).toMatch(/\.profile-header__icon-btn:hover \.profile-header__tooltip/)
    expect(css).toMatch(/\.profile-header__icon-btn:focus-visible \.profile-header__tooltip/)
    expect(css).not.toMatch(/profile-header__mark/)
  })
})

describe('Profile own tabs', () => {
  beforeEach(() => {
    givenSignedIn(HOST_ID)
  })

  it('shows private tabs and owner actions on your own profile', async () => {
    const { user } = renderPage()

    expect(await screen.findByRole('navigation', { name: 'Profile' })).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('my_account')
    expect(screen.getByRole('link', { name: 'Bookings' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'Hosting' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Listings' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reviews' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See how guests see you' })).toHaveAttribute(
      'href',
      `/u/${HOST_ID}?tab=bookings&view=public`,
    )
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/settings')
    expect(
      screen.getByRole('link', {
        name: 'Guests book hosts they can picture. Add a short bio →',
      }),
    ).toHaveAttribute('href', '/settings#bio')
    expect(document.querySelector('.profile-header__camera')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Finish your profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add a short bio' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'My Bookings' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '⚑ Report' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
    const photo = screen.getByRole('button', { name: 'Profile photo' })
    await user.click(photo)
    expect(screen.getByRole('menu')).toHaveClass('ui-overflow__menu--start')
    expect(screen.getByRole('menuitem', { name: 'Add photo' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Change photo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'View photo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Remove photo' })).not.toBeInTheDocument()
  })

  it('scrolls the tab bar horizontally without showing a scrollbar in any browser', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    const tabs = css.match(/\.profile-tabs \{[\s\S]*?\n\}/)
    expect(tabs?.[0]).toMatch(/overflow-x:\s*auto/)
    expect(tabs?.[0]).toMatch(/overflow-y:\s*hidden/)
    expect(tabs?.[0]).toMatch(/scrollbar-width:\s*none/)
    expect(tabs?.[0]).toMatch(/-ms-overflow-style:\s*none/)
    expect(css).toMatch(/\.profile-tabs::-webkit-scrollbar(?:,[\s\S]*?)? \{[\s\S]*?display:\s*none/)
    expect(css).toMatch(/\.profile-tabs::-webkit-scrollbar-track(?:,[\s\S]*?)? \{[\s\S]*?display:\s*none/)
    expect(css).toMatch(/\.profile-tabs::-webkit-scrollbar-thumb(?:,[\s\S]*?)? \{[\s\S]*?display:\s*none/)
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

  it('drops a deleted listing from the public preview', async () => {
    givenListings([
      makeListing({
        id: 'listing-9',
        title: 'fr',
        category: 'Food',
        area: 'Bedok',
        price_per_person: 350,
      }),
    ])
    const previous = supabase.rpc.getMockImplementation()
    supabase.rpc.mockImplementation(async (name, args) => {
      if (name === 'delete_listing') return { data: args?.p_listing_id, error: null }
      if (previous) return previous(name, args)
      return { data: null, error: null }
    })
    const { user } = renderPage({ search: '?tab=hosting' })

    const listingsSection = (
      await screen.findByRole('heading', { name: 'Your listings' })
    ).closest('section')
    const card = within(listingsSection).getByText('fr').closest('.hosting-listing-card')
    await user.click(within(card).getByRole('button', { name: 'More actions' }))
    await user.click(within(card).getByRole('menuitem', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => expect(screen.queryByText('fr')).not.toBeInTheDocument())

    await user.click(screen.getByRole('link', { name: 'See how guests see you' }))

    expect(await screen.findByText('This is how guests see your profile')).toBeInTheDocument()
    expect(screen.getByText('No listings yet.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'fr', level: 3 })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /fr/ })).not.toBeInTheDocument()
  })

  it('opens the hosting panel from ?tab=hosting', async () => {
    renderPage({ search: '?tab=hosting' })

    expect(await screen.findByRole('heading', { name: 'Your listings' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hosting' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.queryByRole('heading', { name: 'My Bookings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('replaces the current history entry when switching tabs', async () => {
    givenSignedIn()
    const router = createMemoryRouter(
      [
        { path: '/', element: <p>Home page</p> },
        { path: '/u/:id', element: <Profile /> },
      ],
      { initialEntries: ['/', `/u/${HOST_ID}?tab=bookings`], initialIndex: 1 }
    )
    const user = userEvent.setup({ delay: null })
    render(<RouterProvider router={router} />)

    await screen.findByRole('link', { name: 'Reviews' })
    await user.click(screen.getByRole('link', { name: 'Reviews' }))

    expect(router.state.location.pathname).toBe(`/u/${HOST_ID}`)
    expect(router.state.location.search).toBe('?tab=reviews')
    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute('aria-current', 'page')

    await router.navigate(-1)
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toBe('')
  })

  it('switches tabs without reloading the profile and keeps opened tabs mounted', async () => {
    givenBookings([makeBooking({ id: 'booking-1' })])
    const { user } = renderPage()

    await screen.findByRole('heading', { name: 'My Bookings' })
    const profileReads = supabase.__calls('users', 'select').length
    const bookingReads = supabase.__calls('bookings', 'select').length

    await user.click(screen.getByRole('link', { name: 'Reviews' }))
    expect(await screen.findByRole('region', { name: 'Reviews' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'My Bookings' })).not.toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Bookings' }))
    expect(screen.getByRole('heading', { name: 'My Bookings' })).toBeInTheDocument()
    expect(supabase.__calls('users', 'select')).toHaveLength(profileReads)
    expect(supabase.__calls('bookings', 'select')).toHaveLength(bookingReads)
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/\.profile-tab-panel\[hidden\] \{\s*display:\s*none/)
  })

  it('keeps other query keys when switching tabs', async () => {
    renderPage({ search: '?connect=pending&tab=bookings' })

    await screen.findByRole('link', { name: 'Reviews' })
    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute(
      'href',
      `/u/${HOST_ID}?connect=pending&tab=reviews`
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

  it('treats ?tab=listings as bookings', async () => {
    renderPage({ search: '?tab=listings' })

    expect(await screen.findByRole('heading', { name: 'My Bookings' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bookings' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.queryByRole('link', { name: 'Listings' })).not.toBeInTheDocument()
  })

  it('hides Hosting and puts Start hosting in the card for a non-host', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      avatar_url: null,
      is_id_verified: true,
      is_host: false,
    })
    givenHostReviews([])
    renderPage()

    await screen.findByRole('navigation', { name: 'Profile' })
    expect(screen.queryByRole('link', { name: 'Hosting' })).not.toBeInTheDocument()
    expect(await screen.findByText('No bookings yet.')).toBeInTheDocument()
    expect(screen.getByText('Got something you could teach?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start hosting' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(screen.queryByText('No listings yet.')).not.toBeInTheDocument()
  })

  it('treats ?tab=hosting as bookings when the owner is not a host', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      avatar_url: null,
      is_id_verified: true,
      is_host: false,
    })
    givenHostReviews([])
    renderPage({ search: '?tab=hosting' })

    expect(await screen.findByRole('heading', { name: 'My Bookings' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your listings' })).not.toBeInTheDocument()
  })

  it('shows your own bio in the header when it is saved', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      bio: 'I pull rosettas.',
      avatar_url: null,
      is_id_verified: true,
      is_host: true,
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header .detail-host__bio').textContent).toBe(
      'I pull rosettas.',
    )
    expect(screen.queryByRole('heading', { name: 'About' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Add a short bio/ })).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header__camera')).toBeInTheDocument()
  })

  it('lets you view, change and remove your photo, and updates the header', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      avatar_url: 'https://cdn.test/mei.jpg',
      is_id_verified: true,
      is_host: true,
    })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Profile photo' }))
    expect(screen.getByRole('menuitem', { name: 'View photo' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Change photo' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Remove photo' })).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'View photo' }))
    expect(screen.getByRole('dialog', { name: "Mei's photo" })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await user.click(screen.getByRole('button', { name: 'Profile photo' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove photo' }))
    const confirm = screen.getByRole('dialog')
    expect(confirm).toHaveTextContent('Remove your profile photo?')
    await user.click(within(confirm).getByRole('button', { name: 'Remove photo' }))

    await waitFor(() =>
      expect(document.querySelector('.detail-host__avatar')).toHaveTextContent('M'),
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('Profile public preview', () => {
  beforeEach(() => {
    givenSignedIn(HOST_ID)
  })

  it('carries the current tab into public preview and back', async () => {
    const { user } = renderPage({ search: '?tab=hosting' })

    expect(await screen.findByRole('link', { name: 'See how guests see you' })).toHaveAttribute(
      'href',
      `/u/${HOST_ID}?tab=hosting&view=public`,
    )

    await user.click(screen.getByRole('link', { name: 'See how guests see you' }))

    expect(await screen.findByText('This is how guests see your profile')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your profile' })).toHaveAttribute(
      'href',
      `/u/${HOST_ID}?tab=hosting`,
    )

    await user.click(screen.getByRole('link', { name: 'Back to your profile' }))

    expect(await screen.findByRole('link', { name: 'Hosting' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows the public layout plus the bar, and no owner controls', async () => {
    givenListings([
      makeListing({
        id: 'listing-9',
        title: 'Latte art',
        category: 'Food',
        area: 'Bedok',
        price_per_person: 3500,
      }),
    ])
    const { user } = renderPage({ search: '?view=public' })

    expect(await screen.findByText('This is how guests see your profile')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your profile' })).toHaveAttribute(
      'href',
      `/u/${HOST_ID}`,
    )
    expect(screen.getByRole('heading', { name: 'Sessions by Mei' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Latte art', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reviews' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share profile' })).toBeInTheDocument()
    expect(screen.queryByText('Only you see these')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Milestones' })).not.toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalledWith('my_profile_stats')
    expect(screen.queryByRole('navigation', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'See how guests see you' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Profile photo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Finish your profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Add a short bio/ })).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header__camera')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Back to your profile' }))
    expect(await screen.findByRole('navigation', { name: 'Profile' })).toBeInTheDocument()
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
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'See how guests see you' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
    expect(document.querySelector('.profile-header__camera')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sessions by Mei' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reviews' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My Bookings' })).not.toBeInTheDocument()
  })

  it("opens a photo viewer from another person's avatar", async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      avatar_url: 'https://cdn.test/mei.jpg',
      is_id_verified: true,
      is_host: true,
    })
    givenSignedIn(OTHER_ID)
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: "View Mei's photo" }))
    expect(screen.getByRole('dialog', { name: "Mei's photo" })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Profile photo' })).not.toBeInTheDocument()
  })
})

describe('Profile card restyle', () => {
  it('renders the banner and an overlapping avatar', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    const banner = document.querySelector('.profile-header__banner')
    expect(banner).toHaveAttribute('data-banner', 'sand')
    expect(banner.querySelectorAll('.profile-banner__circle')).toHaveLength(3)
    expect(banner.querySelectorAll('.profile-banner__circle[aria-hidden="true"]')).toHaveLength(3)
    expect(document.querySelector('.profile-header__face .detail-host__avatar')).toBeInTheDocument()
  })

  it('shows the pencil and eye on your own profile, with their labels', async () => {
    givenSignedIn(HOST_ID)
    renderPage()

    const edit = await screen.findByRole('link', { name: 'Edit profile' })
    expect(edit).toHaveAttribute('href', '/settings')
    expect(edit.querySelector('.profile-header__tooltip')).toHaveTextContent('Edit profile')
    const preview = screen.getByRole('link', { name: 'See how guests see you' })
    expect(preview).toHaveAttribute('href', `/u/${HOST_ID}?tab=bookings&view=public`)
    expect(preview.querySelector('.profile-header__tooltip')).toHaveTextContent(
      'See how guests see you',
    )
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
  })

  it('keeps Report on other people and hides owner actions', async () => {
    givenSignedIn(OTHER_ID)
    const { user } = renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'See how guests see you' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Report profile' })).toBeInTheDocument()
  })

  it('shows the camera badge only when your own profile has no photo', async () => {
    givenSignedIn(HOST_ID)
    renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__camera')).toBeInTheDocument()
  })

  it('hides the camera badge once a photo is there', async () => {
    givenSignedIn(HOST_ID)
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      bio: null,
      avatar_url: 'https://cdn.test/mei.jpg',
      is_id_verified: true,
      is_host: true,
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__camera')).not.toBeInTheDocument()
  })

  it('uses host wording for the bio prompt', async () => {
    givenSignedIn(HOST_ID)
    renderPage()
    expect(
      await screen.findByRole('link', {
        name: 'Guests book hosts they can picture. Add a short bio →',
      }),
    ).toHaveAttribute('href', '/settings#bio')
  })

  it('uses guest wording for a non-host bio prompt', async () => {
    givenSignedIn(HOST_ID)
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      bio: null,
      avatar_url: null,
      is_id_verified: true,
      is_host: false,
    })
    renderPage()
    expect(
      await screen.findByRole('link', {
        name: "Add a short bio so hosts know who's coming →",
      }),
    ).toHaveAttribute('href', '/settings#bio')
    expect(
      screen.queryByRole('link', { name: 'Guests book hosts they can picture. Add a short bio →' }),
    ).not.toBeInTheDocument()
  })

  it('never shows the bio prompt in public preview', async () => {
    givenSignedIn(HOST_ID)
    renderPage({ search: '?view=public' })

    await screen.findByText('This is how guests see your profile')
    expect(screen.queryByRole('link', { name: /Add a short bio/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header__camera')).not.toBeInTheDocument()
  })

  it('keeps categories on listing cards and never on the profile card', async () => {
    givenListings([
      makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' }),
      makeListing({ id: 'listing-8', title: 'Pour over', category: 'Food' }),
      makeListing({ id: 'listing-7', title: 'Open mic', category: 'Music' }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__chips')).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header__chip')).not.toBeInTheDocument()
    expect(screen.queryByText('Teaches')).not.toBeInTheDocument()
    expect(screen.queryByText('Next session')).not.toBeInTheDocument()
    expect(document.querySelector('.profile-listings')).toHaveTextContent('Food')
    expect(document.querySelector('.profile-listings')).toHaveTextContent('Music')
  })
})

const V2_ROW = {
  banner_preset: null,
  banner_url: null,
  featured_review_id: null,
  instagram_handle: null,
  tiktok_handle: null,
}

function givenHost(overrides = {}) {
  givenProfile({
    id: HOST_ID,
    display_name: 'Mei',
    bio: null,
    avatar_url: null,
    is_id_verified: true,
    is_host: true,
    stripe_payouts_enabled: true,
    ...V2_ROW,
    ...overrides,
  })
}

const HOST_STATS = {
  guests_hosted: 42,
  repeat_guests: 3,
  sessions_attended: 0,
  categories_tried: 0,
  reviews_written: 0,
  joined_at: '2026-09-01T00:00:00Z',
}

describe('Profile card layout', () => {
  it('shows no stat cards and a New host pill on a public profile with nothing yet', async () => {
    givenRpcs({ hostReviews: [], sessionsHeld: 0 })
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(screen.queryByTestId('profile-stats')).not.toBeInTheDocument()
    expect(screen.getByText('New host')).toBeInTheDocument()
    expect(screen.queryByText('No reviews yet')).not.toBeInTheDocument()
  })

  it('never renders Next session or category pills on any profile view', async () => {
    givenListings([
      makeListing({ id: 'listing-1', category: 'Food' }),
      makeListing({ id: 'listing-2', category: 'Fitness' }),
    ])
    givenSignedIn(HOST_ID)
    givenSessions([
      makeSession({
        id: 'soon',
        listing_id: 'listing-1',
        starts_at: hoursFromNow(24),
        listings: { title: 'Latte art' },
      }),
    ])
    const { unmount } = renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(screen.queryByText('Next session')).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header__chips')).not.toBeInTheDocument()
    unmount()

    givenSignedIn('someone-else')
    renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(screen.queryByText('Next session')).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header__chips')).not.toBeInTheDocument()
  })

  it('shows rating and sessions held as stripe cards, plus private counts on your own profile', async () => {
    givenSignedIn(HOST_ID)
    givenListings([makeListing({ id: 'listing-9', category: 'Food' })])
    givenRpcs({
      hostReviews: [makeReview({ id: 'r1', rating: 5 }), makeReview({ id: 'r2', rating: 4 })],
      sessionsHeld: 12,
      stats: HOST_STATS,
    })
    renderPage()

    const stats = await screen.findByTestId('profile-stats')
    const cards = [...stats.querySelectorAll('.stat-card')]
    expect(cards).toHaveLength(4)
    expect(stats).toHaveClass('stat-grid--4')
    expect(cards[0]).toHaveClass('stat-card--green')
    expect(cards[0]).toHaveTextContent('4.5 ★')
    expect(cards[0]).toHaveTextContent('2 reviews')
    expect(cards[0].querySelector('.stat-card__icon')).not.toBeInTheDocument()
    expect(cards[1]).toHaveClass('stat-card--blue')
    expect(cards[1]).toHaveTextContent('12')
    expect(cards[1]).toHaveTextContent('Sessions held')
    expect(cards[2]).toHaveTextContent('3')
    expect(cards[2]).toHaveTextContent('Repeat guests')
    expect(cards[3]).toHaveTextContent('42')
    expect(cards[3]).toHaveTextContent('Guests hosted')
    expect(cards[2]).toHaveClass('stat-card--private')
    expect(screen.getByText('Only you see these')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('my_profile_stats')
    expect(screen.queryByText('New host')).not.toBeInTheDocument()
  })

  it('shows only the public cards to guests and never asks for private stats', async () => {
    givenSignedIn(OTHER_ID)
    givenRpcs({ hostReviews: [makeReview({ rating: 4 })], sessionsHeld: 2, stats: HOST_STATS })
    renderPage()

    const stats = await screen.findByTestId('profile-stats')
    expect(stats).toHaveClass('stat-grid--compact')
    expect(stats.querySelectorAll('.stat-card')).toHaveLength(2)
    expect(stats).not.toHaveTextContent('Repeat guests')
    expect(screen.queryByText('Only you see these')).not.toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalledWith('my_profile_stats')
  })

  it('fills a new host profile with placeholders that point at the next step', async () => {
    givenSignedIn(HOST_ID)
    givenHost({ display_name: 'Priya' })
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', area: 'Bishan' })])
    givenSessions([
      makeSession({
        id: 'first',
        listing_id: 'listing-9',
        starts_at: '2099-11-07T04:00:00.000Z',
        listings: { title: 'Latte art' },
        bookings: [{ id: 'b1', status: 'confirmed' }],
      }),
    ])
    givenRpcs({ hostReviews: [], sessionsHeld: 0, stats: { ...HOST_STATS, guests_hosted: 0, repeat_guests: 0 } })
    renderPage()

    await screen.findByRole('heading', { name: 'Priya', level: 1 })
    expect(screen.getByText('New host')).toBeInTheDocument()
    expect(screen.getByText('No reviews yet')).toBeInTheDocument()
    expect(screen.getByText('First session', { selector: '.stat-card__value' })).toBeInTheDocument()
    expect(screen.getByText('Sat, 7 Nov · 1 booked')).toBeInTheDocument()
    expect(
      screen.getByText('Your best review shows here after your first session. You choose which one.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Host your first session on Sat, 7 Nov to earn your first medal.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pick a banner' })).toHaveAttribute('href', '/settings#banner')
    expect(screen.getByRole('link', { name: '+ Add your Instagram or TikTok' })).toHaveAttribute(
      'href',
      '/settings#socials',
    )
    expect(screen.getByText('Hosts in Bishan')).toBeInTheDocument()
    const medals = [...document.querySelectorAll('.medal')]
    expect(medals).toHaveLength(4)
    expect(medals.every((medal) => medal.classList.contains('medal--locked'))).toBe(true)
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })

  it('earns host medals from sessions held and a 5-star review, and says what is next', async () => {
    givenSignedIn(HOST_ID)
    givenRpcs({ hostReviews: [makeReview({ rating: 5 })], sessionsHeld: 12, stats: HOST_STATS })
    renderPage()

    await screen.findByRole('heading', { name: 'Milestones' })
    expect(screen.getByText(/First session/, { selector: '.medal__label' })).toHaveTextContent('(earned)')
    expect(screen.getByText(/10 sessions/, { selector: '.medal__label' })).toHaveTextContent('(earned)')
    expect(screen.getByText(/First 5-star/, { selector: '.medal__label' })).toHaveTextContent('(earned)')
    expect(screen.getByText(/50 sessions/, { selector: '.medal__label' })).toHaveTextContent(
      '(not yet earned)',
    )
    expect(screen.getByText('38 more sessions to unlock 50 sessions.')).toBeInTheDocument()
  })

  it('shows the Founding host pill only when host_is_founding says so', async () => {
    givenRpcs({ founding: true })
    const { unmount } = renderPage()
    expect(await screen.findByText('Founding host')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('host_is_founding', { p_host_id: HOST_ID })
    unmount()

    supabase.rpc.mockImplementation(async (name) =>
      name === 'host_is_founding'
        ? { data: null, error: { message: 'function does not exist' } }
        : { data: name === 'reviews_for_host' ? [] : null, error: null },
    )
    renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(screen.queryByText('Founding host')).not.toBeInTheDocument()
  })

  it('paints the chosen banner colour, or the uploaded photo', async () => {
    givenHost({ banner_preset: 'coral' })
    const { unmount } = renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__banner')).toHaveAttribute('data-banner', 'coral')
    expect(screen.queryByRole('link', { name: 'Pick a banner' })).not.toBeInTheDocument()
    unmount()

    givenHost({ banner_url: 'https://cdn.test/listing-photos/host-1/banner-1.jpg' })
    renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    const banner = document.querySelector('.profile-header__banner')
    expect(banner).toHaveAttribute('data-banner', 'photo')
    expect(banner.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.test/listing-photos/host-1/banner-1.jpg',
    )
  })

  it('links socials out in a new tab', async () => {
    givenHost({ instagram_handle: 'mei.cooks', tiktok_handle: 'meicooks' })
    renderPage()

    const instagram = await screen.findByRole('link', { name: 'Instagram: mei.cooks' })
    expect(instagram).toHaveAttribute('href', 'https://www.instagram.com/mei.cooks/')
    expect(instagram).toHaveAttribute('target', '_blank')
    expect(instagram.getAttribute('rel')).toContain('noopener')
    expect(screen.getByRole('link', { name: 'TikTok: meicooks' })).toHaveAttribute(
      'href',
      'https://www.tiktok.com/@meicooks',
    )
    expect(screen.queryByRole('link', { name: '+ Add your Instagram or TikTok' })).not.toBeInTheDocument()
  })

  it("features the host's pick, else the latest 5-star review", async () => {
    const reviews = [
      makeReview({ id: 'old', rating: 5, comment: 'Old five', created_at: '2026-01-01T00:00:00Z' }),
      makeReview({ id: 'new', rating: 5, comment: 'New five', created_at: '2026-05-01T00:00:00Z' }),
      makeReview({ id: 'four', rating: 4, comment: 'A four', created_at: '2026-06-01T00:00:00Z' }),
    ]
    givenRpcs({ hostReviews: reviews })
    const { unmount } = renderPage()

    let featured = await screen.findByRole('region', { name: 'What guests say' })
    expect(featured).toHaveTextContent('New five')
    expect(within(featured).getByRole('link', { name: 'Read all 3 reviews' })).toHaveAttribute(
      'href',
      '#profile-reviews',
    )
    unmount()

    givenHost({ featured_review_id: 'four' })
    givenSignedIn(HOST_ID)
    givenRpcs({ hostReviews: reviews, stats: HOST_STATS })
    renderPage()
    featured = await screen.findByRole('region', { name: 'Featured review' })
    expect(featured).toHaveTextContent('A four')
    expect(within(featured).getByRole('link', { name: 'Change' })).toHaveAttribute(
      'href',
      '/settings#featured-review',
    )
  })

  it('shows a Coming up strip of open sessions in the next 30 days on the public profile', async () => {
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', area: 'Bedok' })])
    givenSessions([
      makeSession({ id: 'a', listing_id: 'listing-9', starts_at: hoursFromNow(48), spots_remaining: 2 }),
      makeSession({ id: 'b', listing_id: 'listing-9', starts_at: hoursFromNow(96), spots_remaining: 6 }),
      makeSession({ id: 'full', listing_id: 'listing-9', starts_at: hoursFromNow(120), spots_remaining: 0 }),
    ])
    renderPage()

    const section = await screen.findByRole('region', { name: 'Coming up' })
    const links = within(section).getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/listings/listing-9')
    expect(links[0]).toHaveTextContent('2 spots left')
    expect(links[1]).toHaveTextContent('6 spots')
    const call = supabase.__lastCall('sessions', 'select')
    expect(call.chain[0].args[0]).toBe('id, listing_id, starts_at, spots_remaining, status')
    expect(call.chain[0].args[0]).not.toMatch(/bookings/)
    expect(call.filters).toContainEqual({ method: 'eq', column: 'status', value: 'open' })
    expect(supabase.__calls('bookings', 'select')).toHaveLength(0)
  })

  it('hides Coming up when the host cannot take payments', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      bio: null,
      avatar_url: null,
      is_id_verified: true,
      is_host: true,
      stripe_payouts_enabled: false,
    })
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', area: 'Bedok' })])
    givenSessions([
      makeSession({ id: 'a', listing_id: 'listing-9', starts_at: hoursFromNow(48), spots_remaining: 2 }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(screen.queryByRole('region', { name: 'Coming up' })).not.toBeInTheDocument()
    expect(supabase.__calls('sessions', 'select')).toHaveLength(0)
  })

  it('keeps bookings private in public preview too', async () => {
    givenSignedIn(HOST_ID)
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' })])
    givenSessions([makeSession({ id: 'open', listing_id: 'listing-9', starts_at: hoursFromNow(24) })])
    renderPage({ search: '?view=public' })

    await screen.findByText('This is how guests see your profile')
    expect(document.querySelector('.tab-calendar')).not.toBeInTheDocument()
    for (const call of supabase.__calls('sessions', 'select')) {
      expect(call.chain[0].args[0]).not.toMatch(/bookings/)
    }
    expect(supabase.__calls('bookings', 'select')).toHaveLength(0)
  })

  it('moves the hosting calendar into the Hosting tab with booked and open marks', async () => {
    givenSignedIn(HOST_ID)
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' })])
    givenSessions([
      makeSession({
        id: 'booked',
        listing_id: 'listing-9',
        starts_at: hoursFromNow(24),
        listings: { title: 'Latte art' },
        bookings: [{ id: 'b1', status: 'confirmed' }],
      }),
      makeSession({
        id: 'open',
        listing_id: 'listing-9',
        starts_at: hoursFromNow(48),
        listings: { title: 'Latte art' },
        bookings: [],
      }),
    ])
    const { user } = renderPage({ search: '?tab=hosting' })

    const calendar = await screen.findByRole('region', { name: 'Your hosting calendar' })
    expect(document.querySelector('.profile-header .session-calendar')).not.toBeInTheDocument()
    expect(calendar.closest('.profile-tab-layout')).toBeInTheDocument()
    expect(calendar).toHaveTextContent('2 upcoming sessions · 1 booked')
    expect(calendar).toHaveTextContent('Booked')
    expect(calendar).toHaveTextContent('Open')
    const booked = await waitFor(() => {
      const dot = calendar.querySelector('.session-calendar__dot--booked')
      expect(dot).toBeTruthy()
      return dot
    })
    expect(calendar.querySelector('.session-calendar__dot--open')).toBeTruthy()
    await user.click(booked.closest('button'))
    expect(within(calendar).getByText('1 booked')).toBeInTheDocument()
  })

  it('shows guest stats, guest medals and the join month on a guest-only profile', async () => {
    givenSignedIn(HOST_ID)
    givenHost({ display_name: 'Jamie', is_host: false, is_id_verified: false })
    givenRpcs({
      stats: { ...HOST_STATS, sessions_attended: 3, categories_tried: 3, reviews_written: 2, joined_at: '2026-10-02T00:00:00Z' },
    })
    renderPage()

    const stats = await screen.findByTestId('profile-stats')
    expect(stats).toHaveTextContent('Sessions attended')
    expect(stats).toHaveTextContent('Things tried')
    expect(stats).toHaveTextContent('Reviews written')
    expect(screen.getByText('Exploring TryKai since October 2026')).toBeInTheDocument()
    expect(screen.getByText(/Explorer/, { selector: '.medal__label' })).toHaveTextContent('(earned)')
    expect(screen.getByText(/TryKai OG/, { selector: '.medal__label' })).toHaveTextContent('(earned)')
    expect(screen.getByText('2 more sessions to unlock 5 sessions.')).toBeInTheDocument()
    expect(screen.queryByText('New host')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Featured review' })).not.toBeInTheDocument()
  })

  it('shows nothing private on a guest-only public profile', async () => {
    givenHost({ display_name: 'Jamie', is_host: false, bio: 'Coffee person.' })
    renderPage()

    await screen.findByRole('heading', { name: 'Jamie', level: 1 })
    expect(screen.queryByTestId('profile-stats')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Milestones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Sessions by/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Exploring TryKai since/)).not.toBeInTheDocument()
    expect(screen.getByText('Coffee person.')).toBeInTheDocument()
  })

  it('copies the profile link from Share when the share sheet is missing', async () => {
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Share profile' }))
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/${HOST_ID}`)
  })

  it('splits Bookings into Upcoming and Past with date chips and a calendar', async () => {
    givenSignedIn(HOST_ID)
    givenBookings([
      makeBooking({ id: 'booking-1' }),
      makeBooking({
        id: 'booking-2',
        session_id: 'session-2',
        sessions: {
          starts_at: hoursFromNow(-5),
          duration_mins: 90,
          listings: { title: 'Learn latte art with me', host_id: HOST_ID },
        },
      }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: 'My Bookings' })
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Past' })).toBeInTheDocument()
    const rows = [...document.querySelectorAll('.booking-row')]
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('.date-chip--green')).toBeInTheDocument()
    expect(rows[1].querySelector('.date-chip--muted')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave a review' })).toBeInTheDocument()
    const calendar = screen.getByRole('region', { name: 'Your bookings calendar' })
    expect(calendar).toHaveTextContent('1 upcoming')
    expect(calendar).toHaveTextContent('Upcoming')
    expect(calendar).toHaveTextContent('Attended')
  })
})
