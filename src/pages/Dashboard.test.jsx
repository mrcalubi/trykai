import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import RequireAuth from '../components/RequireAuth'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { hoursFromNow, makeAuthSession, makeBooking } from '../test/fixtures'

vi.mock('../lib/supabase')

const HOST_ID = 'host-1'
const USER_ID = 'user-1'

function givenSignedIn(userId = USER_ID) {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: userId } }) },
    error: null,
  })
}

/**
 * `sessions` and `users` are each queried two different ways by this page — as a
 * list while loading the dashboard, and as a single row while cancelling — so
 * the handlers below branch on whether `.single()` was used.
 */
function givenData({
  listings = [],
  bookings = [],
  reviews = [],
  hostSessions = [],
  spotsRemaining = 2,
  hostStrikes = 0,
} = {}) {
  supabase.__on('listings', 'select', { data: listings, error: null })
  supabase.__on('bookings', 'select', (call) =>
    call.single ? { data: { status: 'pending' }, error: null } : { data: bookings, error: null }
  )
  supabase.__on('reviews', 'select', { data: reviews, error: null })
  supabase.__on('sessions', 'select', (call) =>
    call.single
      ? { data: { spots_remaining: spotsRemaining }, error: null }
      : { data: hostSessions, error: null }
  )
  supabase.__on('users', 'select', {
    data: { stripe_payouts_enabled: true, is_host: listings.length > 0, host_strikes: hostStrikes },
    error: null,
  })
}

function makeHostSession(overrides = {}) {
  return {
    id: 'session-1',
    starts_at: hoursFromNow(30),
    listing_id: 'listing-1',
    listings: { title: 'Latte art' },
    bookings: [{ id: 'booking-1', status: 'confirmed', guests_count: 2, total_amount: 9000 }],
    ...overrides,
  }
}

function makeMyListing(overrides = {}) {
  return { id: 'listing-1', title: 'Latte art', area: 'Bedok', category: 'Food', ...overrides }
}

// Mounted behind the same guard App.jsx puts it behind, so the page always has
// a signed-in user. RequireAuth owns the signed-out case and tests it itself.
async function renderDashboard(options = {}) {
  const utils = renderWithRouter(
    <RequireAuth>
      <Dashboard />
    </RequireAuth>,
    { route: '/dashboard', path: '/dashboard', ...options }
  )
  await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
  return utils
}

function sectionFor(title) {
  return screen.getByRole('heading', { name: title, level: 2 }).closest('section')
}

beforeEach(() => {
  supabase.__reset()
  givenSignedIn()
  givenData()
})

describe('Dashboard access control', () => {
  it('scopes every query to the signed-in user', async () => {
    givenSignedIn('user-42')
    await renderDashboard()

    expect(supabase.__lastCall('listings', 'select').filters).toContainEqual({
      method: 'eq',
      column: 'host_id',
      value: 'user-42',
    })
    expect(supabase.__lastCall('bookings', 'select').filters).toContainEqual({
      method: 'eq',
      column: 'guest_id',
      value: 'user-42',
    })
  })

  it('reports a load failure', async () => {
    supabase.__on('listings', 'select', { data: null, error: { message: 'permission denied' } })
    await renderDashboard()

    expect(screen.getByText('permission denied')).toBeInTheDocument()
  })
})

describe('Dashboard verification review', () => {
  it('offers the review queue to an admin', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'my_verification') return { data: [{ is_admin: true }], error: null }
      return { data: null, error: null }
    })
    await renderDashboard()

    expect(screen.getByRole('link', { name: 'Review verifications' })).toHaveAttribute(
      'href',
      '/admin/verifications'
    )
  })

  it('keeps the review queue off a host dashboard', async () => {
    await renderDashboard()

    expect(screen.queryByRole('link', { name: 'Review verifications' })).not.toBeInTheDocument()
  })
})

describe('Dashboard empty states', () => {
  it('shows an empty state for each section', async () => {
    await renderDashboard()

    expect(screen.getByText('No upcoming sessions with active bookings.')).toBeInTheDocument()
    expect(screen.getByText('No bookings yet.')).toBeInTheDocument()
    expect(within(sectionFor('My Listings')).getByRole('link', { name: 'Create one' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
  })
})

describe('Dashboard listings', () => {
  it('lists the host listings with an edit link', async () => {
    givenData({ listings: [makeMyListing({ id: 'listing-9', title: 'Boxing' })] })
    await renderDashboard()

    expect(screen.getByText('Boxing')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/edit-listing/listing-9'
    )
  })

  it('deactivates a listing rather than deleting the row', async () => {
    givenData({ listings: [makeMyListing()] })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Delete listing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    const call = supabase.__lastCall('listings', 'update')
    expect(call.payload).toEqual({ is_active: false })
    expect(call.filters).toContainEqual({ method: 'eq', column: 'id', value: 'listing-1' })
    expect(call.filters).toContainEqual({ method: 'eq', column: 'host_id', value: USER_ID })
  })

  it('removes the listing from the page once deleted', async () => {
    givenData({ listings: [makeMyListing()] })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Delete listing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => expect(screen.queryByText('Latte art')).not.toBeInTheDocument())
  })

  it('keeps the listing when the host backs out', async () => {
    givenData({ listings: [makeMyListing()] })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Delete listing' }))
    await user.click(screen.getByRole('button', { name: 'Keep listing' }))

    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
    expect(screen.getByText('Latte art')).toBeInTheDocument()
  })

  it('reports a failed deletion', async () => {
    givenData({ listings: [makeMyListing()] })
    supabase.__on('listings', 'update', { error: { message: 'not your listing' } })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Delete listing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect(await screen.findByText('not your listing')).toBeInTheDocument()
    expect(screen.getByText('Latte art')).toBeInTheDocument()
  })
})

describe('Dashboard add session', () => {
  beforeEach(() => {
    givenData({ listings: [makeMyListing()] })
  })

  async function openSessionForm(user) {
    await user.click(screen.getByRole('button', { name: 'Add Session' }))
  }

  function fillSession({ date = '2026-09-01', time = '10:30', duration = '90', spots = '4' } = {}) {
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: time } })
    fireEvent.change(screen.getByLabelText('Duration (mins)'), { target: { value: duration } })
    fireEvent.change(screen.getByLabelText('Spots total'), { target: { value: spots } })
  }

  it('stores the start time as UTC converted from Singapore time', async () => {
    const { user } = await renderDashboard()
    await openSessionForm(user)
    fillSession({ date: '2026-09-01', time: '10:30' })

    await user.click(screen.getByRole('button', { name: 'Add session' }))

    await waitFor(() => expect(supabase.__calls('sessions', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('sessions', 'insert').payload).toEqual({
      listing_id: 'listing-1',
      starts_at: '2026-09-01T02:30:00.000Z',
      duration_mins: 90,
      spots_total: 4,
      spots_remaining: 4,
      status: 'open',
    })
  })

  it('opens a new session with every spot available', async () => {
    const { user } = await renderDashboard()
    await openSessionForm(user)
    fillSession({ spots: '6' })

    await user.click(screen.getByRole('button', { name: 'Add session' }))

    await waitFor(() => expect(supabase.__calls('sessions', 'insert')).toHaveLength(1))
    const { spots_total: total, spots_remaining: remaining } = supabase.__lastCall(
      'sessions',
      'insert'
    ).payload
    expect(remaining).toBe(total)
  })

  it('rejects a session with no date or time', async () => {
    const { user } = await renderDashboard()
    await openSessionForm(user)
    fireEvent.submit(document.querySelector('.dashboard-card__form'))

    expect(await screen.findByText('Please enter a date and time.')).toBeInTheDocument()
    expect(supabase.__calls('sessions', 'insert')).toHaveLength(0)
  })

  it('rejects a zero-minute session', async () => {
    const { user } = await renderDashboard()
    await openSessionForm(user)
    fillSession({ duration: '0' })
    fireEvent.submit(document.querySelector('.dashboard-card__form'))

    expect(await screen.findByText('Duration must be at least 1 minute.')).toBeInTheDocument()
  })

  it('rejects a session with no spots', async () => {
    const { user } = await renderDashboard()
    await openSessionForm(user)
    fillSession({ spots: '0' })
    fireEvent.submit(document.querySelector('.dashboard-card__form'))

    expect(await screen.findByText('Spots total must be at least 1.')).toBeInTheDocument()
  })

  it('closes the form after a successful save', async () => {
    const { user } = await renderDashboard()
    await openSessionForm(user)
    fillSession()

    await user.click(screen.getByRole('button', { name: 'Add session' }))

    await waitFor(() => expect(screen.queryByLabelText('Date')).not.toBeInTheDocument())
  })

  it('keeps the form open and shows the error when the save fails', async () => {
    supabase.__on('sessions', 'insert', { error: { message: 'overlapping session' } })
    const { user } = await renderDashboard()
    await openSessionForm(user)
    fillSession()

    await user.click(screen.getByRole('button', { name: 'Add session' }))

    expect(await screen.findByText('overlapping session')).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
  })
})

describe('Dashboard guest cancellation', () => {
  it('offers cancellation for an upcoming confirmed booking', async () => {
    givenData({ bookings: [makeBooking()] })
    await renderDashboard()

    expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
  })

  it('does not offer cancellation once the session has passed', async () => {
    givenData({
      bookings: [makeBooking({ sessions: { starts_at: hoursFromNow(-2), listings: {} } })],
    })
    await renderDashboard()

    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('does not offer cancellation for an already cancelled booking', async () => {
    givenData({ bookings: [makeBooking({ status: 'cancelled' })] })
    await renderDashboard()

    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  // A $45 booking carries a $6.75 platform fee, leaving a $38.25 lesson fee. The
  // partial tiers refund a share of the lesson fee only.
  function bookingCancelledAt(hours) {
    return makeBooking({
      total_amount: 4500,
      platform_fee: 675,
      sessions: { starts_at: hoursFromNow(hours), listings: { title: 'Latte art' } },
    })
  }

  it('reads the platform fee it needs to work out a partial refund', async () => {
    givenData({ bookings: [makeBooking()] })
    await renderDashboard()

    expect(supabase.__lastCall('bookings', 'select').chain[0].args[0]).toContain('platform_fee')
  })

  it.each([
    [72, 'Full refund of $45, including the platform fee'],
    [30, 'Partial refund of $19.13 — 50% of the lesson fee'],
    [12, 'Partial refund of $9.56 — 25% of the lesson fee'],
    [3, 'No refund (cancelled less than 6 hours before the session).'],
  ])('quotes the published refund %i hours before the session', async (hours, quote) => {
    givenData({ bookings: [bookingCancelledAt(hours)] })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))

    expect(screen.getByText(new RegExp(quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
  })

  it('asks the cancel-booking function to refund the guest', async () => {
    givenData({ bookings: [makeBooking()] })
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, refund_amount: 4500 }, error: null })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled())
    expect(supabase.functions.invoke).toHaveBeenCalledWith('cancel-booking', {
      body: { booking_id: 'booking-1' },
      headers: { Authorization: 'Bearer test-access-token' },
    })
  })

  it('shows an error from the cancel function', async () => {
    givenData({ bookings: [makeBooking()] })
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'already cancelled' },
    })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))

    expect(await screen.findByText('already cancelled')).toBeInTheDocument()
  })
})

describe('Dashboard host cancellation', () => {
  it('lists only sessions that have active bookings', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({ id: 's-active' }),
        makeHostSession({
          id: 's-empty',
          bookings: [{ id: 'b-x', status: 'cancelled', guests_count: 1, total_amount: 1000 }],
        }),
      ],
    })
    await renderDashboard()

    expect(within(sectionFor('Upcoming Hosted Sessions')).getAllByText('Latte art')).toHaveLength(1)
  })

  it('warns about the strike before cancelling', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Cancel session' }))

    expect(screen.getByText(/add a strike to your account/)).toBeInTheDocument()
    expect(screen.getByText('Full refund of $90')).toBeInTheDocument()
  })

  it('asks the cancel-booking function to cancel the whole session', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    supabase.functions.invoke.mockResolvedValue({ data: { cancelled: 1 }, error: null })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Cancel session' }))
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled())
    expect(supabase.functions.invoke).toHaveBeenCalledWith('cancel-booking', {
      body: { session_id: 'session-1' },
      headers: { Authorization: 'Bearer test-access-token' },
    })
  })

  it('shows an error from the cancel function', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    supabase.functions.invoke.mockResolvedValue({
      data: { error: 'refund failed' },
      error: null,
    })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Cancel session' }))
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))

    expect(await screen.findByText('refund failed')).toBeInTheDocument()
  })
})

describe('Dashboard payout setup', () => {
  it('asks a host without payouts enabled to set them up', async () => {
    givenData({ listings: [makeMyListing()] })
    supabase.__on('users', 'select', {
      data: { stripe_payouts_enabled: false, is_host: true },
      error: null,
    })
    await renderDashboard()

    expect(screen.getByRole('heading', { name: 'Set up payouts' })).toBeInTheDocument()
  })

  it('asks Stripe for an account link when payouts are not set up', async () => {
    givenData({ listings: [makeMyListing()] })
    supabase.__on('users', 'select', {
      data: { stripe_payouts_enabled: false, is_host: true },
      error: null,
    })
    supabase.functions.invoke.mockResolvedValue({
      data: { stripe_payouts_enabled: true, url: null },
      error: null,
    })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Set up payouts' }))

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled())
    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-account-link', {
      body: {},
      headers: { Authorization: 'Bearer test-access-token' },
    })
    expect(await screen.findByText('Payouts are set up. You can take bookings.')).toBeInTheDocument()
  })

  it('shows Stripe’s actual error when payout setup fails', async () => {
    givenData({ listings: [makeMyListing()] })
    supabase.__on('users', 'select', {
      data: { stripe_payouts_enabled: false, is_host: true },
      error: null,
    })
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            error: 'You cannot create Account Links until your platform branding is configured.',
          }),
        },
      },
    })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Set up payouts' }))

    expect(
      await screen.findByText(
        'You cannot create Account Links until your platform branding is configured.'
      )
    ).toBeInTheDocument()
  })

  it('explains a successful return from Stripe onboarding', async () => {
    givenData({ listings: [makeMyListing()] })
    renderWithRouter(
      <RequireAuth>
        <Dashboard />
      </RequireAuth>,
      { route: '/dashboard?connect=return', path: '/dashboard' }
    )

    expect(
      await screen.findByText('Payout setup submitted. It can take a minute for Stripe to confirm.')
    ).toBeInTheDocument()
  })

  it('asks the host to finish onboarding when Stripe sends them back to refresh', async () => {
    givenData({ listings: [makeMyListing()] })
    renderWithRouter(
      <RequireAuth>
        <Dashboard />
      </RequireAuth>,
      { route: '/dashboard?connect=refresh', path: '/dashboard' }
    )

    expect(
      await screen.findByText('Please finish payout setup to receive payments.')
    ).toBeInTheDocument()
  })
})

describe('Dashboard reviews', () => {
  const pastBooking = () =>
    makeBooking({
      id: 'booking-past',
      sessions: {
        starts_at: hoursFromNow(-5),
        listings: { title: 'Latte art', host_id: HOST_ID },
      },
    })

  it('invites a review after the session has happened', async () => {
    givenData({ bookings: [pastBooking()] })
    await renderDashboard()

    expect(screen.getByRole('button', { name: 'Leave a review' })).toBeInTheDocument()
  })

  it('does not invite a review before the session', async () => {
    givenData({ bookings: [makeBooking()] })
    await renderDashboard()

    expect(screen.queryByRole('button', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('does not invite a second review for the same booking', async () => {
    givenData({ bookings: [pastBooking()], reviews: [{ booking_id: 'booking-past' }] })
    await renderDashboard()

    expect(screen.queryByRole('button', { name: 'Leave a review' })).not.toBeInTheDocument()
    expect(screen.getByText('Review submitted')).toBeInTheDocument()
  })

  it('does not invite a review on a cancelled booking', async () => {
    givenData({ bookings: [makeBooking({ ...pastBooking(), status: 'cancelled' })] })
    await renderDashboard()

    expect(screen.queryByRole('button', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('requires a star rating', async () => {
    givenData({ bookings: [pastBooking()] })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Leave a review' }))
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    expect(await screen.findByText('Please select a star rating.')).toBeInTheDocument()
    expect(supabase.__calls('reviews', 'insert')).toHaveLength(0)
  })

  it('saves the review against the host', async () => {
    givenData({ bookings: [pastBooking()] })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Leave a review' }))
    await user.click(screen.getByRole('button', { name: '4 stars' }))
    await user.type(screen.getByLabelText('Comment'), '  Great session  ')
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    await waitFor(() => expect(supabase.__calls('reviews', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('reviews', 'insert').payload).toEqual({
      booking_id: 'booking-past',
      reviewer_id: USER_ID,
      reviewee_id: HOST_ID,
      rating: 4,
      comment: 'Great session',
      role: 'guest',
    })
  })

  it('stores a null comment for a rating-only review', async () => {
    givenData({ bookings: [pastBooking()] })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Leave a review' }))
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    await waitFor(() => expect(supabase.__calls('reviews', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('reviews', 'insert').payload.comment).toBeNull()
  })

  it('marks the booking as reviewed once saved', async () => {
    givenData({ bookings: [pastBooking()] })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Leave a review' }))
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    expect(await screen.findByText('Review submitted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('refuses to review a booking with no host on record', async () => {
    givenData({
      bookings: [
        makeBooking({
          id: 'booking-past',
          sessions: { starts_at: hoursFromNow(-5), listings: { title: 'Latte art' } },
        }),
      ],
    })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Leave a review' }))
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    expect(await screen.findByText('Could not find host for this booking.')).toBeInTheDocument()
    expect(supabase.__calls('reviews', 'insert')).toHaveLength(0)
  })

  it('reports a rejected review', async () => {
    givenData({ bookings: [pastBooking()] })
    supabase.__on('reviews', 'insert', { error: { message: 'duplicate review' } })
    const { user } = await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Leave a review' }))
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    expect(await screen.findByText('duplicate review')).toBeInTheDocument()
  })
})

describe('Dashboard post-payment status', () => {
  function renderReturningFromPayment() {
    return renderWithRouter(
      <RequireAuth>
        <Dashboard />
      </RequireAuth>,
      { route: '/dashboard?booking=booking-1', path: '/dashboard' }
    )
  }

  it('confirms the booking when the webhook has already landed', async () => {
    givenData({ bookings: [makeBooking()] })
    supabase.__on('bookings', 'select', (call) =>
      call.single ? { data: { status: 'confirmed' }, error: null } : { data: [], error: null }
    )
    renderReturningFromPayment()

    expect(
      await screen.findByText('Booking confirmed! Your payment was successful.')
    ).toBeInTheDocument()
  })

  it('explains an abandoned payment', async () => {
    supabase.__on('bookings', 'select', (call) =>
      call.single ? { data: { status: 'cancelled' }, error: null } : { data: [], error: null }
    )
    renderReturningFromPayment()

    expect(
      await screen.findByText('This booking was not completed. You can try booking again.')
    ).toBeInTheDocument()
  })

  it('falls back to a safe message when the booking cannot be read', async () => {
    supabase.__on('bookings', 'select', (call) =>
      call.single ? { data: null, error: { message: 'not found' } } : { data: [], error: null }
    )
    renderReturningFromPayment()

    expect(
      await screen.findByText('Could not verify your booking. Check My Bookings below.')
    ).toBeInTheDocument()
  })

  it('clears the booking parameter from the URL once resolved', async () => {
    supabase.__on('bookings', 'select', (call) =>
      call.single ? { data: { status: 'confirmed' }, error: null } : { data: [], error: null }
    )
    const { currentSearch } = renderReturningFromPayment()

    await screen.findByText('Booking confirmed! Your payment was successful.')
    await waitFor(() => expect(currentSearch()).toBe(''))
  })

  it('only polls for the signed-in guest own booking', async () => {
    supabase.__on('bookings', 'select', (call) =>
      call.single ? { data: { status: 'confirmed' }, error: null } : { data: [], error: null }
    )
    renderReturningFromPayment()

    await screen.findByText('Booking confirmed! Your payment was successful.')
    const poll = supabase.__calls('bookings', 'select').find((call) => call.single)
    expect(poll.filters).toContainEqual({ method: 'eq', column: 'id', value: 'booking-1' })
    expect(poll.filters).toContainEqual({ method: 'eq', column: 'guest_id', value: USER_ID })
  })
})
