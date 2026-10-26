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
import { formatSessionDateTime } from '../lib/sessionDate'

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

function givenRpcs({ hostReviews = [], listingRatings = [], account, sessionsHeld = 0 } = {}) {
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
      'id, display_name, bio, avatar_url, is_host, is_id_verified',
      'id, display_name, bio, avatar_url, is_host',
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
    expect(document.querySelector('.profile-header__stats')).not.toHaveTextContent('reviews')
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

    await screen.findByRole('heading', { name: 'Reviews (2)' })
    const stats = document.querySelector('.profile-header__stats')
    expect(stats.textContent.replace(/\s+/g, ' ').trim()).toContain('4.5')
    expect(stats).toHaveTextContent('2 reviews')
    expect(document.querySelector('.profile-header__star')).toHaveAttribute('aria-hidden', 'true')
  })

  it('loads reviews through reviews_for_host, not a bookings embed', async () => {
    givenHostReviews([makeReview({ listing_title: 'Latte art' })])
    renderPage()

    await screen.findByText('Wonderful host.')
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

    expect(supabase.__lastCall('users', 'select').chain[0].args[0]).toBe(
      'id, display_name, bio, avatar_url, is_host, is_id_verified'
    )
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
      /\.profile-about__body,\s*\n\.detail-host__bio,\s*\n\.profile-header__name \{\s*\n\s*overflow-wrap:\s*break-word/
    )
    expect(css).toMatch(
      /\.detail-description,\s*\n\.profile-about__body,\s*\n\.detail-host__bio \{[\s\S]*?white-space:\s*pre-wrap/
    )
  })

  it('stacks header copy in a column and keeps the 1120px page', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    const copy = css.match(/\.profile-header__copy \{[\s\S]*?\n\}/)
    expect(copy?.[0]).toMatch(/display:\s*flex/)
    expect(copy?.[0]).toMatch(/flex-direction:\s*column/)
    expect(copy?.[0]).toMatch(/gap:\s*6px/)
    expect(css).toMatch(
      /@media \(min-width: 1024px\) \{[\s\S]*?\.profile-header__identity \{[\s\S]*?align-items:\s*center/,
    )
    expect(css).toMatch(/\.profile-header__body \{[\s\S]*?z-index:\s*1/)
    expect(css).toMatch(/\.profile-header__banner \{[\s\S]*?z-index:\s*0/)
    expect(css).toMatch(
      /\.profile-header__body:has\(> \.profile-header__aside\) \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 340px/,
    )
    const statFigure = css.match(/\.profile-header__stat dd \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(statFigure).toMatch(/color:\s*var\(--navy\)/)
    expect(statFigure).toMatch(/font-family:\s*var\(--display\)/)
    expect(statFigure).not.toMatch(/--coral|--success/)
    expect(css).toMatch(/\.page--profile \{[\s\S]*?max-width:\s*1120px/)
    expect(css).toMatch(/\.page--detail \{[\s\S]*?max-width:\s*1120px/)
    expect(css).toMatch(/\.profile-header__name \{[\s\S]*?-webkit-line-clamp:\s*2/)
  })

  it('paints a sand banner and overlaps the avatar with a surface ring', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/\.profile-header__banner \{[\s\S]*?height:\s*96px/)
    expect(css).toMatch(/\.profile-header__banner \{[\s\S]*?background:\s*var\(--sand\)/)
    expect(css).toMatch(/\.profile-header__banner \{[\s\S]*?height:\s*120px/)
    expect(css).toMatch(
      /\.profile-header \.detail-host__avatar \{[\s\S]*?box-shadow:\s*0 0 0 4px var\(--surface\)/,
    )
    expect(css).toMatch(/\.profile-header__body \{[\s\S]*?margin-top:\s*-40px/)
    expect(css).toMatch(/\.profile-header__icon-btn \{[\s\S]*?width:\s*44px/)
    expect(css).toMatch(/\.profile-header__icon-btn:hover \.profile-header__tooltip/)
    expect(css).toMatch(/\.profile-header__icon-btn:focus-visible \.profile-header__tooltip/)
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

  it('keeps other query keys when switching tabs', async () => {
    renderPage({ search: '?booking=booking-1&tab=bookings' })

    await screen.findByRole('link', { name: 'Reviews' })
    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute(
      'href',
      `/u/${HOST_ID}?booking=booking-1&tab=reviews`
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

  it('hides Hosting and puts the host link on a non-host Bookings empty state', async () => {
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
    expect(screen.getByRole('link', { name: 'Host a session' })).toHaveAttribute(
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
    expect(screen.getByRole('heading', { name: 'Listings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Latte art', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reviews' })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'Listings' })).toBeInTheDocument()
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
    expect(document.querySelector('.profile-header__banner')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelectorAll('.profile-header__banner .profile-header__mark')).toHaveLength(8)
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/url\('\.\/assets\/categories\/food\.png'\)/)
    expect(css).toMatch(/url\('\.\/assets\/categories\/music\.png'\)/)
    expect(css).toMatch(/url\('\.\/assets\/categories\/arts\.png'\)/)
    expect(css).toMatch(/url\('\.\/assets\/categories\/fitness\.png'\)/)
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
        name: 'Add a short bio so guests know who you are →',
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

  it('lists distinct Teaches chips from the approved, active listings already on the page', async () => {
    givenListings([
      makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' }),
      makeListing({ id: 'listing-8', title: 'Pour over', category: 'Food' }),
      makeListing({ id: 'listing-7', title: 'Open mic', category: 'Music' }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    const chips = [...document.querySelectorAll('.profile-header__chip')].map(
      (chip) => chip.textContent,
    )
    expect(chips).toEqual(['Food', 'Music'])
    expect(screen.queryByText('Fitness')).not.toBeInTheDocument()
    expect(screen.queryByText('Teaches')).not.toBeInTheDocument()
  })

  it('hides Teaches when the host has no live listings', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__chips')).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header__stats')).not.toBeInTheDocument()
  })
})

describe('Profile card layout', () => {
  it('hides stats at 0 held sessions and with no reviews', async () => {
    givenRpcs({ hostReviews: [], sessionsHeld: 0 })
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__stats')).not.toBeInTheDocument()
  })

  it('puts category pills in the stats row, hugging content at most 3 per row', async () => {
    givenListings([
      makeListing({ id: 'listing-1', category: 'Food' }),
      makeListing({ id: 'listing-2', category: 'Fitness' }),
      makeListing({ id: 'listing-3', category: 'Arts' }),
      makeListing({ id: 'listing-4', category: 'Music' }),
      makeListing({ id: 'listing-5', category: 'Language' }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    const stats = document.querySelector('.profile-header__stats')
    const chips = stats.querySelector('.profile-header__chips')
    expect(screen.queryByText('Teaches')).not.toBeInTheDocument()
    expect(chips).not.toHaveClass('profile-header__chips--wrap')
    expect(chips.querySelectorAll('.profile-header__chip')).toHaveLength(5)
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    const chipRow = css.match(/\.profile-header__chips \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(chipRow).toMatch(/display:\s*flex/)
    expect(chipRow).toMatch(/flex-wrap:\s*wrap/)
    expect(chipRow).toMatch(/max-width:/)
    expect(chipRow).not.toMatch(/grid-template-columns/)
    const chip = css.match(/\.profile-header__chip \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(chip).toMatch(/display:\s*inline-flex/)
    expect(chip).toMatch(/flex:\s*0 0 auto/)
    expect(document.querySelector('.profile-header__aside .profile-header__chips')).not.toBeInTheDocument()
  })

  it('shows navy rating and sessions-held figures', async () => {
    givenListings([makeListing({ id: 'listing-9', category: 'Food' })])
    givenRpcs({
      hostReviews: [makeReview({ id: 'r1', rating: 5 }), makeReview({ id: 'r2', rating: 4 })],
      sessionsHeld: 12,
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    const stats = document.querySelector('.profile-header__stats')
    expect(stats).toHaveTextContent('4.5')
    expect(stats).toHaveTextContent('2 reviews')
    expect(stats).toHaveTextContent('12')
    expect(stats).toHaveTextContent('Sessions held')
    expect(document.querySelector('.profile-header__star')).toBeInTheDocument()
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    const statFigure = css.match(/\.profile-header__stat dd \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(statFigure).toMatch(/color:\s*var\(--navy\)/)
    expect(statFigure).not.toMatch(/--coral|--success/)
    const star = css.match(/\.profile-header__star \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(star).toMatch(/font-size:\s*0\.6em/)
  })

  it('shows a solid booked mark and a hollow open mark on the own calendar', async () => {
    givenSignedIn(HOST_ID)
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' })])
    const bookedAt = hoursFromNow(24)
    const openAt = hoursFromNow(48)
    givenSessions([
      makeSession({
        id: 'booked',
        listing_id: 'listing-9',
        starts_at: bookedAt,
        listings: { title: 'Latte art' },
        bookings: [{ id: 'b1', status: 'confirmed' }],
      }),
      makeSession({
        id: 'open',
        listing_id: 'listing-9',
        starts_at: openAt,
        listings: { title: 'Latte art' },
        bookings: [],
      }),
    ])
    const { user } = renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    const bookedDay = document.querySelector(
      '.session-calendar__day .session-calendar__dot--booked',
    )
    const openDay = document.querySelector('.session-calendar__day .session-calendar__dot--open')
    expect(bookedDay).toBeInTheDocument()
    expect(openDay).toBeInTheDocument()
    expect(bookedDay.closest('button')).not.toHaveClass('session-calendar__day--available')
    expect(openDay.closest('button')).not.toHaveClass('session-calendar__day--available')
    expect(document.querySelector('.profile-header__legend')).toHaveTextContent('Booked')
    expect(document.querySelector('.profile-header__legend')).toHaveTextContent('Open')

    await user.click(bookedDay.closest('button'))
    expect(bookedDay.closest('button')).toHaveClass('session-calendar__day--selected')
    expect(bookedDay.closest('button')).not.toHaveClass('session-calendar__day--available')
    expect(await screen.findByRole('link', { name: /1 booked/ })).toHaveAttribute(
      'href',
      `/u/${HOST_ID}?tab=hosting`,
    )
  })

  it('hides the calendar, Next session, and any sessions request on a public profile', async () => {
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' })])
    givenSessions([
      makeSession({
        id: 'open',
        listing_id: 'listing-9',
        starts_at: hoursFromNow(24),
        listings: { title: 'Latte art' },
        bookings: [{ id: 'b1', status: 'confirmed' }],
      }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__calendar')).not.toBeInTheDocument()
    expect(screen.queryByText('Next session')).not.toBeInTheDocument()
    expect(supabase.__calls('sessions', 'select')).toHaveLength(0)
    expect(supabase.__calls('bookings', 'select')).toHaveLength(0)
  })

  it('still renders Next session and the calendar on the own profile', async () => {
    givenSignedIn(HOST_ID)
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' })])
    const soon = hoursFromNow(24)
    givenSessions([
      makeSession({
        id: 'soon',
        listing_id: 'listing-9',
        starts_at: soon,
        listings: { title: 'Latte art' },
      }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__calendar')).toBeInTheDocument()
    const next = screen.getByRole('link', { name: new RegExp(formatSessionDateTime(soon)) })
    expect(next).toHaveAttribute('href', '/listings/listing-9')
    expect(next).toHaveTextContent('Latte art')
    expect(supabase.__calls('sessions', 'select').length).toBeGreaterThan(0)
  })

  it('hides the calendar and stats for a non-host', async () => {
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      bio: 'I drink coffee.',
      avatar_url: null,
      is_id_verified: true,
      is_host: false,
    })
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__calendar')).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header__stats')).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header .detail-host__bio')).toHaveTextContent(
      'I drink coffee.',
    )
  })

  it('never shows Next session when there is none', async () => {
    givenSignedIn(HOST_ID)
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' })])
    givenSessions([])
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(screen.queryByText('Next session')).not.toBeInTheDocument()
  })

  it('does not fetch sessions or bookings in public preview', async () => {
    givenSignedIn(HOST_ID)
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' })])
    givenSessions([
      makeSession({
        id: 'open',
        listing_id: 'listing-9',
        starts_at: hoursFromNow(24),
        listings: { title: 'Latte art' },
      }),
    ])
    renderPage({ search: '?view=public' })

    await screen.findByText('This is how guests see your profile')
    expect(document.querySelector('.profile-header__calendar')).not.toBeInTheDocument()
    expect(screen.queryByText('Next session')).not.toBeInTheDocument()
    expect(supabase.__calls('sessions', 'select')).toHaveLength(0)
    expect(supabase.__calls('bookings', 'select')).toHaveLength(0)
  })

  it('keeps the mobile stack: identity, stats, bio, next session, calendar', async () => {
    givenSignedIn(HOST_ID)
    givenListings([
      makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' }),
      makeListing({ id: 'listing-8', title: 'Open mic', category: 'Music' }),
    ])
    givenRpcs({
      hostReviews: [makeReview({ rating: 5 })],
      sessionsHeld: 3,
    })
    givenProfile({
      id: HOST_ID,
      display_name: 'Mei',
      bio: 'I pull rosettas.',
      avatar_url: null,
      is_id_verified: true,
      is_host: true,
    })
    givenSessions([
      makeSession({
        id: 'soon',
        listing_id: 'listing-9',
        starts_at: hoursFromNow(24),
        listings: { title: 'Latte art' },
      }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    const body = document.querySelector('.profile-header__body')
    const primary = body.querySelector('.profile-header__primary')
    const aside = body.querySelector('.profile-header__aside')
    const identity = primary.querySelector('.profile-header__identity')
    expect(identity.contains(document.querySelector('.profile-header__face'))).toBe(true)
    expect(identity.contains(document.querySelector('.profile-header__name'))).toBe(true)
    expect(primary.querySelector('.profile-header__stats').contains(primary.querySelector('.profile-header__chips'))).toBe(true)
    expect(
      primary.querySelector('.profile-header__stats').compareDocumentPosition(primary.querySelector('.detail-host__bio'))
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(primary.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      aside.querySelector('.profile-header__next').compareDocumentPosition(aside.querySelector('.profile-header__calendar'))
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(
      /@media \(min-width: 1024px\) \{[\s\S]*?\.profile-header__body:has\(> \.profile-header__aside\) \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 340px/,
    )
  })

  it('keeps the name on the banner edge whether or not the right column is there', async () => {
    givenListings([makeListing({ id: 'listing-9', title: 'Latte art', category: 'Food' })])
    givenSessions([
      makeSession({
        id: 'soon',
        listing_id: 'listing-9',
        starts_at: hoursFromNow(24),
        listings: { title: 'Latte art' },
      }),
    ])
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(
      /@media \(min-width: 1024px\) \{[\s\S]*?\.profile-header__identity \{[\s\S]*?align-items:\s*center/,
    )
    expect(css).toMatch(
      /@media \(min-width: 1024px\) \{[\s\S]*?\.profile-header__aside \{[\s\S]*?padding-top:\s*52px/,
    )

    givenSignedIn(HOST_ID)
    const { unmount } = renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__aside')).toBeInTheDocument()
    expect(document.querySelector('.profile-header__identity')).toHaveClass('profile-header__identity')
    unmount()

    givenSignedIn('someone-else')
    renderPage()
    await screen.findByRole('heading', { name: 'Mei', level: 1 })
    expect(document.querySelector('.profile-header__aside')).not.toBeInTheDocument()
    expect(document.querySelector('.profile-header__identity')).toHaveClass('profile-header__identity')
  })

  it('renders Bookings cards in the listing grid', async () => {
    givenSignedIn(HOST_ID)
    givenBookings([
      makeBooking({ id: 'booking-1' }),
      makeBooking({ id: 'booking-2', session_id: 'session-2' }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: 'My Bookings' })
    const grid = document.querySelector('.profile-tab-panel .listings-grid')
    expect(grid).toHaveClass('listings-grid--bookings')
    expect(grid.querySelectorAll('.dashboard-card')).toHaveLength(2)
    expect(document.querySelector('.empty-state')).not.toBeInTheDocument()
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect(css).toMatch(
      /\.listings-grid--bookings \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    )
    expect(css).toMatch(
      /@media \(min-width: 1024px\) \{\s*\.listings-grid--bookings \{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/,
    )
    expect(css).toMatch(/\.listings-grid--bookings \{[\s\S]*?align-items:\s*stretch/)
    expect(css).toMatch(
      /\.listings-grid--bookings \.dashboard-card \{[\s\S]*?flex-direction:\s*column/,
    )
    expect(css).toMatch(
      /\.listings-grid--bookings \.booking-card__actions \{[\s\S]*?margin-top:\s*auto/,
    )
  })
})
