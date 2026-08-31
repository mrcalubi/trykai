import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ListingDetail from './ListingDetail'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { hoursFromNow, makeAuthSession, makeListing, makeReview, makeSession } from '../test/fixtures'

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
  supabase.__on('sessions', 'select', { data: sessions, error: null })
}

function givenReviews(reviews) {
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
  stripe.instance.confirmPayment.mockResolvedValue({ error: null })
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

  it('names the host', async () => {
    givenListing(makeListing({ users: { full_name: 'Mei Ling', avatar_url: null } }))
    renderPage()

    expect(await screen.findByText('Hosted by Mei Ling')).toBeInTheDocument()
  })

  it('falls back to Anonymous when the host profile is missing', async () => {
    givenListing(makeListing({ users: null }))
    renderPage()

    expect(await screen.findByText('Hosted by Anonymous')).toBeInTheDocument()
  })

  it('averages the host reviews to one decimal place', async () => {
    givenListing()
    givenReviews([makeReview({ id: 'r1', rating: 5 }), makeReview({ id: 'r2', rating: 4 })])
    renderPage()

    expect(await screen.findByText('★ 4.5 average rating')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reviews (2)' })).toBeInTheDocument()
  })

  it('says there are no reviews yet when the host has none', async () => {
    givenListing()
    givenReviews([])
    renderPage()

    expect(await screen.findByText('No reviews yet')).toBeInTheDocument()
    expect(screen.getByText('No reviews yet.')).toBeInTheDocument()
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
})

describe('ListingDetail sessions', () => {
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

    expect(await screen.findByText(/90 mins · 3 spots left/)).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /Pay by card/ })).toHaveTextContent('$51')
    expect(screen.getByRole('button', { name: /PayNow/ })).toHaveTextContent('$48.45')
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

    await user.click(await screen.findByRole('button', { name: /Pay by card/ }))

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
    await user.click(await screen.findByRole('button', { name: /Pay by card/ }))

    expect(await screen.findByTestId('stripe-elements')).toBeInTheDocument()
    expect(screen.getByText('Total: $90')).toBeInTheDocument()
    expect(screen.getByTestId('payment-element')).toBeInTheDocument()
  })

  it('reports a transport failure from the edge function', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    await user.click(await screen.findByRole('button', { name: /Pay by card/ }))

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
    await user.click(await screen.findByRole('button', { name: /Pay by card/ }))

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

    expect(await screen.findByText('PayNow · 5% off the advertised price')).toBeInTheDocument()
    expect(document.querySelector('.detail-booking-card__price')).toHaveTextContent('$48.45')
    expect(document.querySelector('.session-card__price')).toHaveTextContent('$48.45')
    expect(screen.getByRole('button', { name: /PayNow/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports a business error returned in the response body', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({ data: { error: 'Not enough spots' }, error: null })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    await user.click(await screen.findByRole('button', { name: /Pay by card/ }))

    expect(await screen.findByText('Not enough spots')).toBeInTheDocument()
  })

  it('reports a response that carries no client secret', async () => {
    givenSignedIn()
    supabase.functions.invoke.mockResolvedValue({ data: { total_amount: 4500 }, error: null })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Book' }))
    await user.click(await screen.findByRole('button', { name: /Pay by card/ }))

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
    await utils.user.click(await screen.findByRole('button', { name: 'Book' }))
    await utils.user.click(await screen.findByRole('button', { name: /Pay by card/ }))
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
    expect(currentSearch()).toBe('?booking=booking-1')
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
