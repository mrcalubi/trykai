import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ListingDetail from './ListingDetail'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { hoursFromNow, makeAuthSession, makeListing, makeReview, makeSession } from '../test/fixtures'
import { monthBounds } from '../lib/sessionCalendar'

vi.mock('../lib/supabase')

const stripe = vi.hoisted(() => ({
  instance: { confirmPayment: vi.fn(async () => ({ error: null })) },
  loadStripe: vi.fn(() => Promise.resolve({})),
}))

vi.mock('@stripe/stripe-js', () => ({ loadStripe: stripe.loadStripe }))

vi.mock('@stripe/react-stripe-js', async () => {
  const { createElement } = await import('react')
  return {
    Elements: ({ children }) =>
      createElement('div', { 'data-testid': 'stripe-elements' }, children),
    PaymentElement: () => createElement('div', { 'data-testid': 'payment-element' }),
    useStripe: () => stripe.instance,
    useElements: () => ({}),
  }
})

function givenListing(listing = makeListing()) {
  supabase.__on('listings', 'select', { data: listing, error: null })
}

function givenSessions(sessions) {
  supabase.__on('sessions', 'select', (call) => {
    let rows = sessions.filter((session) =>
      call.filters.every((filter) => {
        const value = session[filter.column]
        if (filter.method === 'eq') return value === filter.value
        if (filter.method === 'gt') return value > filter.value
        if (filter.method === 'gte') return value >= filter.value
        if (filter.method === 'lt') return value < filter.value
        return true
      })
    )

    const order = call.chain.findLast((step) => step.method === 'order')
    if (order) {
      const [column, options] = order.args
      const direction = options?.ascending === false ? -1 : 1
      rows.sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * direction)
    }

    const limit = call.chain.findLast((step) => step.method === 'limit')
    if (limit) rows = rows.slice(0, limit.args[0])
    return { data: rows, error: null }
  })
}

function givenReviews(reviews) {
  supabase.rpc.mockImplementation(async (name, args) => {
    if (name === 'reviews_for_listing') {
      const listingId = args?.p_listing_id
      const rows = (reviews ?? []).filter((review) => {
        const reviewListingId = review.bookings?.sessions?.listing_id
        return reviewListingId == null || reviewListingId === listingId
      })
      return { data: rows, error: null }
    }
    return { data: null, error: null }
  })
}

function givenHostReviews(reviews) {
  supabase.__on('reviews', 'select', { data: reviews, error: null })
}

function givenSignedIn(session = makeAuthSession()) {
  supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null })
}

function renderPage() {
  return renderWithRouter(<ListingDetail />, {
    route: '/listings/listing-1',
    path: '/listings/:id',
  })
}

beforeEach(() => {
  supabase.__reset()
  stripe.instance.confirmPayment.mockReset()
  stripe.instance.confirmPayment.mockResolvedValue({
    error: null,
    paymentIntent: { status: 'succeeded' },
  })
})

describe('ListingDetail loading and failure', () => {
  it('shows a loading message first', () => {
    givenListing()
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows the error and a way back when the listing cannot be loaded', async () => {
    supabase.__on('listings', 'select', { data: null, error: { message: 'No rows found' } })
    renderPage()

    expect(await screen.findByText('No rows found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to browse/ })).toHaveAttribute('href', '/')
  })

  it('only loads listings that are still active', async () => {
    givenListing()
    renderPage()
    await screen.findByRole('heading', { name: 'Learn latte art with me', level: 1 })

    expect(supabase.__lastCall('listings', 'select').filters).toContainEqual({
      method: 'eq',
      column: 'is_active',
      value: true,
    })
  })
})

describe('ListingDetail content', () => {
  it('renders the listing headline details', async () => {
    givenListing(makeListing({ title: 'Latte art', category: 'Food', area: 'Tiong Bahru' }))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Latte art', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Tiong Bahru')).toBeInTheDocument()
    expect(screen.getByText('Pull your first rosetta in ninety minutes.')).toBeInTheDocument()
  })

  it('shows the card all-in total, not the raw lesson price', async () => {
    givenListing(makeListing({ price_per_person: 4500 }))
    renderPage()

    expect(await screen.findByText(/\$51/)).toBeInTheDocument()
    expect(screen.queryByText('$45')).not.toBeInTheDocument()
  })

  it('names the host by display name and links to their profile', async () => {
    givenListing(
      makeListing({
        users: { display_name: 'Latte Queen', full_name: 'Mei Ling Tan', avatar_url: null },
      })
    )
    renderPage()

    expect(await screen.findByRole('link', { name: 'Latte Queen' })).toHaveAttribute(
      'href',
      '/u/host-1'
    )
    expect(screen.queryByText('Mei Ling Tan')).not.toBeInTheDocument()
  })

  it('falls back to the first name when display_name is missing', async () => {
    givenListing(makeListing({ users: { full_name: 'Mei Ling', avatar_url: null } }))
    renderPage()

    expect(await screen.findByRole('link', { name: 'Mei' })).toHaveAttribute('href', '/u/host-1')
    expect(screen.queryByText('Mei Ling')).not.toBeInTheDocument()
  })

  it('falls back to Anonymous when the host profile is missing', async () => {
    givenListing(makeListing({ users: null }))
    renderPage()

    expect(await screen.findByRole('link', { name: 'Anonymous' })).toHaveAttribute('href', '/u/host-1')
  })

  it('averages the host reviews to one decimal place', async () => {
    givenListing()
    givenReviews([makeReview({ id: 'r1', rating: 5 }), makeReview({ id: 'r2', rating: 4 })])
    givenHostReviews([makeReview({ id: 'r1', rating: 5 }), makeReview({ id: 'r2', rating: 4 })])
    renderPage()

    await screen.findByRole('heading', { name: 'Reviews (2)' })
    expect(document.querySelector('.detail-host__rating').textContent.replace(/\s+/g, ' ').trim()).toBe(
      '★ 4.5 · 2 reviews'
    )
    expect(document.querySelector('.detail-host__star')).toHaveAttribute('aria-hidden', 'true')
  })

  it('rates the host from every listing, not only this one', async () => {
    givenListing()
    givenReviews([makeReview({ id: 'r1', rating: 5 })])
    givenHostReviews([
      makeReview({ id: 'r1', rating: 5 }),
      makeReview({ id: 'r-other', rating: 1 }),
    ])
    renderPage()

    await screen.findByRole('heading', { name: 'Reviews (1)' })
    expect(document.querySelector('.detail-host__rating').textContent.replace(/\s+/g, ' ').trim()).toBe(
      '★ 3.0 · 2 reviews'
    )
    expect(document.querySelector('.detail-host__star')).toHaveAttribute('aria-hidden', 'true')
  })

  it('loads the host average by reviewee_id and listing reviews through the RPC', async () => {
    givenListing()
    givenReviews([makeReview()])
    givenHostReviews([makeReview()])
    renderPage()

    await screen.findByRole('heading', { name: 'Learn latte art with me', level: 1 })
    expect(supabase.rpc).toHaveBeenCalledWith('reviews_for_listing', { p_listing_id: 'listing-1' })
    expect(supabase.__lastCall('reviews', 'select').filters).toEqual(
      expect.arrayContaining([
        { method: 'eq', column: 'reviewee_id', value: 'host-1' },
        { method: 'eq', column: 'role', value: 'guest' },
      ])
    )
    expect(supabase.__lastCall('reviews', 'select').filters).not.toContainEqual({
      method: 'eq',
      column: 'bookings.sessions.listing_id',
      value: 'listing-1',
    })
  })

  it('still shows listing reviews to a signed-out visitor', async () => {
    givenListing()
    givenReviews([makeReview({ comment: 'Great latte class', users: { full_name: 'Arun' } })])
    renderPage()

    expect(await screen.findByText('Great latte class')).toBeInTheDocument()
    expect(screen.getByText('Arun')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('reviews_for_listing', { p_listing_id: 'listing-1' })
  })

  it('hides reviews whose booking belongs to another listing', async () => {
    givenListing()
    givenReviews([
      makeReview({
        id: 'r1',
        rating: 5,
        bookings: { sessions: { listing_id: 'listing-1' } },
      }),
      makeReview({
        id: 'r2',
        rating: 1,
        comment: 'Wrong listing',
        bookings: { sessions: { listing_id: 'listing-other' } },
      }),
    ])
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Reviews (1)' })).toBeInTheDocument()
    expect(screen.queryByText('Wrong listing')).not.toBeInTheDocument()
  })

  it('wraps user-written listing and booking copy with one overflow-wrap rule', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    expect([...css.matchAll(/overflow-wrap:\s*break-word/g)]).toHaveLength(1)
    expect(css).not.toMatch(/overflow-wrap:\s*anywhere/)
    expect(css).toMatch(
      /\.detail-title,\s*\n\.detail-description,\s*\n\.detail-area,\s*\n\.detail-list li,\s*\n\.review-card__comment,\s*\n\.ui-card__title,\s*\n\.dashboard-card__title,\s*\n\.dashboard-card__meta/
    )
  })

  it('hides the host rating when the host has no reviews', async () => {
    givenListing()
    givenReviews([])
    givenHostReviews([])
    renderPage()

    await screen.findByRole('link', { name: 'Mei' })
    expect(document.querySelector('.detail-host__rating')).not.toBeInTheDocument()
    expect(screen.getByText('No reviews yet.')).toBeInTheDocument()
    expect(screen.queryByText(/· \d+ reviews?/)).not.toBeInTheDocument()
  })

  it('lists what the host provides', async () => {
    givenListing(makeListing({ whats_provided: ['Materials', 'Food & drinks'] }))
    renderPage()

    await screen.findByRole('heading', { name: "What's provided" })
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Materials',
      'Food & drinks',
    ])
  })

  it('omits the provided section when the list is empty', async () => {
    givenListing(makeListing({ whats_provided: [] }))
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { name: "What's provided" })).not.toBeInTheDocument()
  })

  it('renders every photo in the gallery', async () => {
    givenListing(makeListing({ photo_urls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'] }))
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('img', { name: 'Learn latte art with me 1' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Learn latte art with me 2' })).toBeInTheDocument()
  })

  it('tells the CSS how many photos to lay out', async () => {
    givenListing(makeListing({ photo_urls: ['a.jpg', 'b.jpg', 'c.jpg'] }))
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(document.querySelector('.detail-gallery__scroller')).toHaveAttribute(
      'data-photo-count',
      '3'
    )
  })

  it('shows one swipe position dot per photo, the first one active', async () => {
    givenListing(makeListing({ photo_urls: ['a.jpg', 'b.jpg', 'c.jpg'] }))
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    const dots = document.querySelectorAll('.detail-gallery__dot')
    expect(dots).toHaveLength(3)
    expect(dots[0].className).toContain('detail-gallery__dot--active')
    expect(dots[1].className).not.toContain('detail-gallery__dot--active')
  })

  it('omits the dots when there is nothing to swipe between', async () => {
    givenListing(makeListing({ photo_urls: ['a.jpg'] }))
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(document.querySelector('.detail-gallery__dots')).not.toBeInTheDocument()
  })

  it('opens the clicked gallery photo in the lightbox', async () => {
    givenListing(makeListing({ photo_urls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'] }))
    const { user } = renderPage()

    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'View photo 2 of 2' }))

    const dialog = screen.getByRole('dialog', { name: 'Learn latte art with me photos' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://cdn.test/b.jpg')
    expect(within(dialog).getByText('2 / 2')).toBeInTheDocument()
  })

  it('offers only close when the listing has a single photo', async () => {
    givenListing(makeListing({ photo_urls: ['https://cdn.test/a.jpg'] }))
    const { user } = renderPage()

    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'View photo 1 of 1' }))

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous photo' })).not.toBeInTheDocument()
  })

  it('keeps the host high, above the description and the reviews', async () => {
    givenListing()
    givenReviews([makeReview({ id: 'r1', rating: 5 })])
    renderPage()

    await screen.findByRole('link', { name: 'Mei' })
    const order = [...document.querySelectorAll('.detail-host, .detail-section__title')].map(
      (node) => (node.className.includes('detail-host') ? 'host' : node.textContent)
    )
    expect(order).toEqual(['host', 'About this experience', "What's provided", 'Reviews (1)'])
  })
})

describe('ListingDetail sessions', () => {
  it('shows the listing error when the session range cannot be loaded', async () => {
    givenListing()
    supabase.__on('sessions', 'select', { data: null, error: { message: 'range failed' } })
    renderPage()

    expect(await screen.findByText('range failed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to browse/ })).toBeInTheDocument()
  })

  it('says when there is nothing to book', async () => {
    givenListing()
    givenSessions([])
    renderPage()

    expect(await screen.findByText('No upcoming sessions available.')).toBeInTheDocument()
  })

  it('shows the duration and remaining spots for each session', async () => {
    givenListing()
    givenSessions([makeSession({ duration_mins: 90, spots_remaining: 3 })])
    renderPage()

    expect(await screen.findByText(/1 hr 30 min · 3 spots left/)).toBeInTheDocument()
  })

  it('uses the singular when only one spot is left', async () => {
    givenListing()
    givenSessions([makeSession({ spots_remaining: 1 })])
    renderPage()

    expect(await screen.findByText(/1 spot left/)).toBeInTheDocument()
  })

  it('disables booking on a sold-out session', async () => {
    givenListing()
    givenSessions([makeSession({ spots_remaining: 0 })])
    renderPage()

    expect(await screen.findByRole('button', { name: 'Book' })).toBeDisabled()
  })

  it('only offers sessions that are open and still in the future', async () => {
    givenListing()
    givenSessions([makeSession()])
    renderPage()
    await screen.findByRole('button', { name: 'Book' })

    const call = supabase.__lastCall('sessions', 'select')
    expect(call.filters).toContainEqual({ method: 'eq', column: 'status', value: 'open' })
    expect(call.filters.some((filter) => filter.method === 'gt' && filter.column === 'starts_at'))
      .toBe(true)
  })

  it('opens on the soonest day and lists only that day’s times', async () => {
    givenListing()
    givenSessions([
      makeSession({
        id: 'late',
        starts_at: '2099-10-09T15:00:00.000Z',
        duration_mins: 45,
        spots_remaining: 1,
      }),
      makeSession({
        id: 'morning',
        starts_at: '2099-10-09T03:00:00.000Z',
        duration_mins: 33,
        spots_remaining: 2,
      }),
      makeSession({
        id: 'other-day',
        starts_at: '2099-10-27T03:00:00.000Z',
        duration_mins: 111,
        spots_remaining: 4,
      }),
      makeSession({ id: 'past', starts_at: '2000-01-01T00:00:00.000Z' }),
      makeSession({ id: 'full', starts_at: '2099-10-09T05:00:00.000Z', status: 'full' }),
    ])
    renderPage()

    expect(await screen.findByRole('heading', { name: /9 Oct · 2 sessions/ })).toBeInTheDocument()
    expect(screen.getByText('11:00 am')).toBeInTheDocument()
    expect(screen.getByText(/33 min · 2 spots left/)).toBeInTheDocument()
    expect(screen.getByText('11:00 pm')).toBeInTheDocument()
    expect(screen.queryByText(/1 hr 51 min/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /9 October, 2 sessions/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  })

  it('shows another day’s times when that date is chosen', async () => {
    givenListing()
    givenSessions([
      makeSession({ id: 'ninth', starts_at: '2099-10-09T03:00:00.000Z', duration_mins: 33 }),
      makeSession({ id: 'twenty-seventh', starts_at: '2099-10-27T03:00:00.000Z', duration_mins: 111 }),
    ])
    const { user } = renderPage()
    await screen.findByRole('heading', { name: /9 Oct · 1 session/ })

    await user.click(screen.getByRole('button', { name: /27 October, 1 session/ }))

    expect(screen.getByRole('heading', { name: /27 Oct · 1 session/ })).toBeInTheDocument()
    expect(screen.getByText(/1 hr 51 min/)).toBeInTheDocument()
    expect(screen.queryByText(/33 min/)).not.toBeInTheDocument()
  })

  it('loads each month once, bounded by Singapore midnights', async () => {
    givenListing()
    givenSessions([
      makeSession({ id: 'october', starts_at: '2099-10-09T03:00:00.000Z', duration_mins: 33 }),
      makeSession({ id: 'november', starts_at: '2099-11-02T03:00:00.000Z', duration_mins: 60 }),
    ])
    const { user } = renderPage()
    await screen.findByRole('heading', { name: /9 Oct · 1 session/ })

    const october = monthBounds('2099-10')
    const firstMonth = supabase.__calls('sessions', 'select').find((call) =>
      call.filters.some((filter) => filter.method === 'gte')
    )
    expect(firstMonth.filters).toContainEqual({
      method: 'gte',
      column: 'starts_at',
      value: october.startIso,
    })
    expect(firstMonth.filters).toContainEqual({
      method: 'lt',
      column: 'starts_at',
      value: october.endIso,
    })

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByRole('heading', { name: /2 Nov · 1 session/ })).toBeInTheDocument()
    expect(screen.getByText(/1 hr · 3 spots left/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByRole('heading', { name: /9 Oct · 1 session/ })).toBeInTheDocument()

    const ranged = supabase
      .__calls('sessions', 'select')
      .filter((call) => call.filters.some((filter) => filter.method === 'gte'))
    expect(ranged.map((call) => call.filters.find((filter) => filter.method === 'gte').value)).toEqual([
      october.startIso,
      monthBounds('2099-11').startIso,
    ])
  })

  it('asks for one month even when a listing has a thousand sessions', async () => {
    const sessions = []
    for (let i = 0; i < 1000; i += 1) {
      const month = i < 500 ? 9 : 10
      sessions.push(
        makeSession({
          id: `bulk-${i}`,
          starts_at: new Date(Date.UTC(2099, month, (i % 28) + 1, i % 12)).toISOString(),
        })
      )
    }
    givenListing()
    givenSessions(sessions)
    renderPage()

    const books = await screen.findAllByRole('button', { name: 'Book' })
    expect(books.length).toBeLessThan(40)
    expect(screen.getByRole('heading', { name: /1 Oct · \d+ sessions/ })).toBeInTheDocument()

    const ranged = supabase
      .__calls('sessions', 'select')
      .filter((call) => call.filters.some((filter) => filter.method === 'gte'))
    expect(ranged).toHaveLength(1)
    expect(ranged[0].filters).toContainEqual({
      method: 'gte',
      column: 'starts_at',
      value: monthBounds('2099-10').startIso,
    })
    const bounded = supabase.__calls('sessions', 'select').filter((call) =>
      call.chain.some((step) => step.method === 'limit')
    )
    expect(bounded).toHaveLength(2)
  })

  it('says when a month between the first and last session has nothing', async () => {
    givenListing()
    givenSessions([
      makeSession({ id: 'october', starts_at: '2099-10-09T03:00:00.000Z' }),
      makeSession({ id: 'december', starts_at: '2099-12-02T03:00:00.000Z', duration_mins: 40 }),
    ])
    const { user } = renderPage()
    await screen.findByRole('heading', { name: /9 Oct · 1 session/ })

    await user.click(screen.getByRole('button', { name: 'Next month' }))

    expect(await screen.findByText('No sessions in November 2099.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Book' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next month' }))

    expect(await screen.findByRole('heading', { name: /2 Dec · 1 session/ })).toBeInTheDocument()
    expect(screen.getByText(/40 min · 3 spots left/)).toBeInTheDocument()
  })

  it('keeps the listing on screen when a month fails to load', async () => {
    givenListing()
    supabase.__on('sessions', 'select', (call) => {
      if (call.filters.some((filter) => filter.method === 'gte')) {
        return { data: null, error: { message: 'sessions unavailable' } }
      }
      return {
        data: [makeSession({ starts_at: '2099-10-09T03:00:00.000Z' })],
        error: null,
      }
    })
    renderPage()

    expect(await screen.findByText('sessions unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Learn latte art with me' })).toBeInTheDocument()
  })

  it('hides the calendar while checking out and brings it back on cancel', async () => {
    givenListing()
    givenSessions([makeSession({ id: 'session-7', starts_at: '2099-10-09T03:00:00.000Z' })])
    givenSignedIn()
    const { user } = renderPage()

    expect(await screen.findByRole('group', { name: 'October 2099' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Book' }))

    expect(screen.queryByRole('group', { name: 'October 2099' })).not.toBeInTheDocument()
    expect(screen.getByText(/9 Oct/)).toBeInTheDocument()
    expect(screen.getByText(/11:00 am · 1 hr 30 min/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('group', { name: 'October 2099' })).toBeInTheDocument()
  })
})

describe('ListingDetail booking', () => {
  beforeEach(() => {
    givenListing()
    givenSessions([makeSession({ id: 'session-7', starts_at: hoursFromNow(72) })])
  })

  it('sends a signed-out guest to log in and remembers the listing', async () => {
    const { user, currentPath, currentState } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(currentState().from.pathname).toBe('/listings/listing-1')
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('offers PayNow at 5% off the advertised card total before creating a PaymentIntent', async () => {
    givenSignedIn()
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))

    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Card · Credit or debit card/ })).toHaveTextContent('$51')
    expect(screen.getByRole('button', { name: /PayNow · 5% off/ })).toHaveTextContent('$51')
    expect(screen.getByRole('button', { name: /PayNow · 5% off/ })).toHaveTextContent('$48.45')
  })

  it('asks the edge function for a card payment intent after the guest picks a rail', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({
      data: { clientSecret: 'cs_test_1', booking_id: 'booking-1', total_amount: 5100 },
      error: null,
    })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    expect(supabase.functions.invoke).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('button', { name: /Card · Credit or debit card/ }))

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledOnce())
    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-payment-intent', {
      body: { session_id: 'session-7', guests_count: 1, payment_rail: 'card' },
      headers: { Authorization: 'Bearer test-access-token' },
    })
  })

  it('opens the payment panel with the amount returned by the server', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({
      data: { clientSecret: 'cs_test_1', booking_id: 'booking-1', total_amount: 9000 },
      error: null,
    })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    await user.click(await screen.findByRole('button', { name: /Card · Credit or debit card/ }))

    expect(await screen.findByTestId('stripe-elements')).toBeInTheDocument()
    expect(screen.getByText('Total: $90')).toBeInTheDocument()
    expect(screen.getByTestId('payment-element')).toBeInTheDocument()
  })

  it('reports a transport failure from the edge function', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    await user.click(await screen.findByRole('button', { name: /Card · Credit or debit card/ }))

    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument()
    expect(screen.queryByTestId('stripe-elements')).not.toBeInTheDocument()
  })

  it('shows Stripe’s actual error when create-payment-intent returns non-2xx', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({ error: 'This host cannot take bookings yet.' }),
        },
      },
    })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    await user.click(await screen.findByRole('button', { name: /Card · Credit or debit card/ }))

    expect(await screen.findByText('This host cannot take bookings yet.')).toBeInTheDocument()
  })

  it('switches the booking total to the PayNow price when that rail is chosen', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code' },
    })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    expect(document.querySelector('.detail-booking-card__price')).toHaveTextContent('$51')

    await user.click(await screen.findByRole('button', { name: /PayNow/ }))

    await waitFor(() =>
      expect(document.querySelector('.detail-booking-card__price')).toHaveTextContent('$48.45'),
    )
    expect(document.querySelector('.session-card__price')).toHaveTextContent('$48.45')
    expect(screen.getByRole('button', { name: /PayNow/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports a business error returned in the response body', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({ data: { error: 'Not enough spots' }, error: null })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    await user.click(await screen.findByRole('button', { name: /Card · Credit or debit card/ }))

    expect(await screen.findByText('Not enough spots')).toBeInTheDocument()
  })

  it('reports a response that carries no client secret', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({ data: { total_amount: 4500 }, error: null })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    await user.click(await screen.findByRole('button', { name: /Card · Credit or debit card/ }))

    expect(await screen.findByText('Failed to start payment. Please try again.')).toBeInTheDocument()
  })

  it('asks the edge function for a PayNow intent when that rail is chosen', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({
      data: { clientSecret: 'cs_test_1', booking_id: 'booking-1', total_amount: 2660 },
      error: null,
    })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    await user.click(await screen.findByRole('button', { name: /PayNow/ }))

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledOnce())
    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-payment-intent', {
      body: { session_id: 'session-7', guests_count: 1, payment_rail: 'paynow' },
      headers: { Authorization: 'Bearer test-access-token' },
    })
  })

  it('does not let a host book their own listing', async () => {
    givenSignedIn(makeAuthSession({ user: { id: 'host-1' } }))
    renderPage()

    expect(await screen.findByRole('button', { name: 'Book' })).toBeDisabled()
    expect(
      screen.getByText('This is your own listing. Hosts cannot book their own sessions.')
    ).toBeInTheDocument()
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('still lets a different signed-in guest book', async () => {
    givenSignedIn(makeAuthSession({ user: { id: 'user-1' } }))
    renderPage()

    expect(await screen.findByRole('button', { name: 'Book' })).toBeEnabled()
    expect(
      screen.queryByText('This is your own listing. Hosts cannot book their own sessions.')
    ).not.toBeInTheDocument()
  })

  it('does not start payment when the host cannot receive payouts', async () => {
    givenListing(
      makeListing({
        users: { full_name: 'Mei Ling', avatar_url: null, stripe_payouts_enabled: false },
      }),
    )
    givenSignedIn()
    renderPage()

    expect(await screen.findByRole('button', { name: 'Book' })).toBeDisabled()
    expect(screen.getByText(/still setting up payouts/)).toBeInTheDocument()
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('updates the live per-person price when more guests are added', async () => {
    givenListing(makeListing({ price_per_person: 2500 }))
    givenSessions([makeSession({ id: 'session-7', spots_remaining: 4 })])
    givenSignedIn()
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))

    expect(screen.getByText('$25 each')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Card · Credit or debit card/ })).toHaveTextContent('$28')

    await user.click(screen.getByRole('button', { name: 'More guests' }))
    await user.click(screen.getByRole('button', { name: 'More guests' }))
    await user.click(screen.getByRole('button', { name: 'More guests' }))

    expect(screen.getByText('$21.25 each, 15% group price')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Card · Credit or debit card/ })).toHaveTextContent('$96')
    expect(screen.getByRole('button', { name: /PayNow · 5% off/ })).toHaveTextContent('$96')
    expect(screen.getByRole('button', { name: /PayNow · 5% off/ })).toHaveTextContent('$91.20')
  })

  it('sends the chosen guest count to create-payment-intent', async () => {
    givenListing()
    givenSessions([makeSession({ id: 'session-7', starts_at: hoursFromNow(72), spots_remaining: 3 })])
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({
      data: { clientSecret: 'cs_test_1', booking_id: 'booking-1', total_amount: 7600 },
      error: null,
    })
    const { user } = renderPage()

    await screen.findByText(/spots left/)
    await user.click(await screen.findByRole('button', { name: 'Book' }))
    await user.click(screen.getByRole('button', { name: 'More guests' }))
    await user.click(await screen.findByRole('button', { name: /Card · Credit or debit card/ }))

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledOnce())
    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-payment-intent', {
      body: { session_id: 'session-7', guests_count: 2, payment_rail: 'card' },
      headers: { Authorization: 'Bearer test-access-token' },
    })
  })

  it('links the booking terms and cancellation policy above the pay buttons', async () => {
    givenSignedIn()
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))

    expect(screen.getByRole('link', { name: 'Booking terms' })).toHaveAttribute(
      'href',
      '/terms#part-3-booking',
    )
    expect(screen.getByRole('link', { name: 'Cancellation Policy' })).toHaveAttribute(
      'href',
      '/cancellation-policy',
    )
  })
})

describe('ListingDetail checkout', () => {
  async function openCheckout() {
    givenListing()
    givenSessions([makeSession({ id: 'session-7' })])
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({
      data: { clientSecret: 'cs_test_1', booking_id: 'booking-1', total_amount: 4500 },
      error: null,
    })
    const utils = renderPage()
    await screen.findByText(/spots left/)
    await utils.user.click(await screen.findByRole('button', { name: 'Book' }))
    await utils.user.click(await screen.findByRole('button', { name: /Card · Credit or debit card/ }))
    await screen.findByTestId('stripe-elements')
    return utils
  }

  it('confirms the payment without leaving the page when possible', async () => {
    const { user } = await openCheckout()

    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    expect(stripe.instance.confirmPayment).toHaveBeenCalledOnce()
    expect(stripe.instance.confirmPayment.mock.calls[0][0]).toMatchObject({
      redirect: 'if_required',
      confirmParams: {
        return_url: expect.stringContaining('/dashboard?booking=booking-1'),
      },
    })
  })

  it('sends the guest to the dashboard to wait for the webhook', async () => {
    const { user, currentPath, currentSearch } = await openCheckout()

    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    await waitFor(() => expect(currentPath()).toBe('/dashboard'))
    expect(currentSearch()).toBe('?booking=booking-1&payment=succeeded')
  })

  it('closes the unpaid checkout when the guest backs out', async () => {
    const { user } = await openCheckout()

    await user.click(within(screen.getByTestId('stripe-elements')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByTestId('stripe-elements')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(supabase.functions.invoke).toHaveBeenCalledWith('cancel-booking', {
        body: { booking_id: 'booking-1' },
        headers: { Authorization: 'Bearer test-access-token' },
      }),
    )
  })

  it('stays on the listing when the guest cancels the payment', async () => {
    stripe.instance.confirmPayment.mockResolvedValue({
      error: null,
      paymentIntent: { status: 'canceled' },
    })
    const { user, currentPath } = await openCheckout()

    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    expect(
      await screen.findByText('Payment was not completed. You have not been charged.')
    ).toBeInTheDocument()
    expect(currentPath()).toBe('/listings/listing-1')
  })

  it('keeps the guest on the page and shows why the card was declined', async () => {
    stripe.instance.confirmPayment.mockResolvedValue({ error: { message: 'Your card was declined.' } })
    const { user, currentPath } = await openCheckout()

    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    expect(await screen.findByText('Your card was declined.')).toBeInTheDocument()
    expect(currentPath()).toBe('/listings/listing-1')
  })

  it('closes the payment panel when the guest backs out', async () => {
    const { user } = await openCheckout()

    await user.click(within(screen.getByTestId('stripe-elements')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByTestId('stripe-elements')).not.toBeInTheDocument()
    expect(stripe.instance.confirmPayment).not.toHaveBeenCalled()
  })
})
