import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Bookings from './Bookings'
import Hosting from './Hosting'
import Dashboard from './Dashboard'
import RedirectToOwnProfile from './RedirectToOwnProfile'
import RequireAuth from '../components/RequireAuth'
import { supabase } from '../lib/supabase'
import { formatDayLabel, formatDayTitle } from '../lib/sessionCalendar'
import { addSingaporeDays, singaporeDateKey } from '../lib/sessionBatch'
import { sessionDayLabel, sessionTimeRange } from '../lib/hostSessions'
import { renderWithDataRouter, renderWithRouter } from '../test/render'
import { hoursFromNow, makeAuthSession, makeBooking } from '../test/fixtures'
import {
  PAYOUT_CHECKING_COPY,
  PAYOUT_PENDING_POLL_MS,
  PAYOUT_PENDING_WAIT_MS,
  PAYOUT_READY_COPY,
  PAYOUT_STILL_CHECKING_COPY,
} from '../lib/payoutReturn'
import {
  LISTING_DELETE_ACTIVE_BOOKINGS,
  LISTING_DELETE_FAILED,
} from '../lib/listingDelete'

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
 * `sessions` is queried as a list (host upcoming sessions). Guest cancel goes
 * through cancel-booking, so the `.single()` branch is only the booking-status
 * poll after checkout.
 */
function givenData({
  listings = [],
  bookings = [],
  reviews = [],
  hostSessions = [],
  spotsRemaining = 2,
  hostStrikes = 0,
  isHost,
  payoutsEnabled = true,
  verificationStatus = 'approved',
  interest = [],
  reviewsDue = [],
  companionBookings = [],
  sessionGuests = [],
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
  accountRow = {
    stripe_payouts_enabled: payoutsEnabled,
    is_host: isHost ?? listings.length > 0,
    host_strikes: hostStrikes,
    verification_status: verificationStatus,
  }
  const previousRpc = supabase.rpc.getMockImplementation()
  givenRpc(async (name, args) => {
    if (name === 'host_listing_interest') {
      return { data: interest, error: null }
    }
    if (name === 'host_reviews_due') {
      return { data: reviewsDue, error: null }
    }
    if (name === 'my_companion_bookings') {
      return { data: companionBookings, error: null }
    }
    if (name === 'host_session_guests') {
      return { data: sessionGuests, error: null }
    }
    if (previousRpc) return previousRpc(name, args)
    return { data: null, error: null }
  })
}

function waitingInterest(listingId, keenCount = 2) {
  return { listing_id: listingId, keen_count: keenCount, weekday: 0, weekend: keenCount, morning: 0, afternoon: 0, evening: 0 }
}

function notifiedListingIds() {
  return supabase.functions.invoke.mock.calls
    .filter(([name]) => name === 'notify-interested')
    .map(([, options]) => options.body.listing_id)
}

let accountRow = {
  stripe_payouts_enabled: true,
  is_host: false,
  host_strikes: 0,
}

function givenRpc(impl) {
  supabase.rpc.mockImplementation(async (name, args) => {
    if (name === 'my_account') {
      return { data: [accountRow], error: null }
    }
    if (impl) return impl(name, args)
    return { data: null, error: null }
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
  return {
    id: 'listing-1',
    title: 'Latte art',
    area: 'Bedok',
    category: 'Food',
    photo_urls: ['https://cdn.test/latte.jpg'],
    duration_mins: 90,
    max_guests: 4,
    ...overrides,
  }
}

// Mounted behind the same guard App.jsx puts it behind, so the page always has
// a signed-in user. RequireAuth owns the signed-out case and tests it itself.
async function renderBookings(options = {}) {
  const utils = renderWithRouter(
    <RequireAuth>
      <Bookings />
    </RequireAuth>,
    { route: '/bookings', path: '/bookings', ...options }
  )
  await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
  return utils
}

async function renderHosting(options = {}) {
  const utils = renderWithRouter(
    <RequireAuth>
      <Hosting />
    </RequireAuth>,
    { route: '/hosting', path: '/hosting', ...options }
  )
  await screen.findByRole('heading', { name: 'Hosting', level: 1 })
  return utils
}

function renderDashboardRedirect(options = {}) {
  return renderWithRouter(
    <RequireAuth>
      <Dashboard />
    </RequireAuth>,
    { route: '/dashboard', path: '*', outlivesNavigation: true, ...options }
  )
}

function renderLegacyToProfile(route) {
  return renderWithRouter(
    <RequireAuth>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/bookings" element={<RedirectToOwnProfile tab="bookings" />} />
        <Route path="/hosting" element={<RedirectToOwnProfile tab="hosting" />} />
        <Route path="/u/:id" element={<p>own profile</p>} />
      </Routes>
    </RequireAuth>,
    { route, path: '*', outlivesNavigation: true }
  )
}

function sectionFor(title) {
  return screen.getByRole('heading', { name: title, level: 2 }).closest('section')
}

function listingCard(title) {
  // Match the card's own title, not "Also offer these times on" checkboxes.
  const heading = within(sectionFor('Your listings'))
    .getAllByText(title)
    .find((node) => node.classList.contains('dashboard-card__title'))
  return heading.closest('.dashboard-card')
}

function dateKeyFromToday(daysAhead) {
  return addSingaporeDays(singaporeDateKey(Date.now()), daysAhead)
}

async function selectCalendarDate(user, dateKey) {
  const name = new RegExp(formatDayLabel(dateKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!screen.queryByRole('button', { name })) {
    await user.click(screen.getByRole('button', { name: 'Next month' }))
  }
  if (!screen.queryByRole('button', { name })) {
    await user.click(screen.getByRole('button', { name: 'Next month' }))
  }
  await user.click(screen.getByRole('button', { name }))
}

async function openListingMenu(user, title = 'Latte art') {
  const card = listingCard(title)
  await user.click(within(card).getByRole('button', { name: /^More for / }))
  return card
}

async function openDeleteListing(user, title = 'Latte art') {
  const card = await openListingMenu(user, title)
  await user.click(within(card).getByRole('menuitem', { name: 'Delete' }))
  return card
}

beforeEach(() => {
  supabase.__reset()
  givenSignedIn()
  givenData()
})

describe('Dashboard redirect', () => {
  it('sends /dashboard to /bookings so existing links keep working', async () => {
    givenSignedIn()
    givenData()
    const { currentPath } = renderDashboardRedirect()

    await waitFor(() => expect(currentPath()).toBe('/bookings'))
  })

  it('keeps a booking query string when redirecting from /dashboard', async () => {
    givenSignedIn()
    givenData()
    const { currentPath, currentSearch } = renderDashboardRedirect({
      route: '/dashboard?booking=booking-1',
    })

    await waitFor(() => expect(currentPath()).toBe('/bookings'))
    expect(currentSearch()).toBe('?booking=booking-1')
  })

  it('sends Connect return URLs to hosting', async () => {
    givenSignedIn()
    givenData({ listings: [makeMyListing()] })
    const { currentPath, currentSearch } = renderDashboardRedirect({
      route: '/dashboard?connect=return',
    })

    await waitFor(() => expect(currentPath()).toBe('/hosting'))
    expect(currentSearch()).toBe('?connect=return')
  })
})

describe('Legacy paths to own profile', () => {
  it('sends /bookings?booking= to the own profile bookings tab with the query intact', async () => {
    givenSignedIn()
    const { currentPath, currentSearch } = renderLegacyToProfile(
      '/bookings?booking=booking-1'
    )

    await waitFor(() => expect(currentPath()).toBe(`/u/${USER_ID}`))
    expect(currentSearch()).toBe('?booking=booking-1&tab=bookings')
  })

  it('keeps every extra query key on the /bookings redirect', async () => {
    givenSignedIn()
    const { currentPath, currentSearch } = renderLegacyToProfile(
      '/bookings?booking=booking-1&ref=stripe'
    )

    await waitFor(() => expect(currentPath()).toBe(`/u/${USER_ID}`))
    expect(currentSearch()).toBe('?booking=booking-1&ref=stripe&tab=bookings')
  })

  it('sends /dashboard?connect=return to the own profile hosting tab with the query intact', async () => {
    givenSignedIn()
    const { currentPath, currentSearch } = renderLegacyToProfile(
      '/dashboard?connect=return'
    )

    await waitFor(() => expect(currentPath()).toBe(`/u/${USER_ID}`))
    expect(currentSearch()).toBe('?connect=return&tab=hosting')
  })
})

describe('Hosting access for guests', () => {
  it('sends a signed-in user who is not a host to /bookings', async () => {
    givenData({ isHost: false })
    const { currentPath } = renderWithRouter(
      <RequireAuth>
        <Hosting />
      </RequireAuth>,
      { route: '/hosting', path: '*', outlivesNavigation: true }
    )

    await waitFor(() => expect(currentPath()).toBe('/bookings'))
    expect(screen.queryByRole('heading', { name: 'Your listings' })).not.toBeInTheDocument()
  })
})

describe('Dashboard access control', () => {
  it('scopes booking queries to the signed-in guest', async () => {
    givenSignedIn('user-42')
    await renderBookings()

    expect(supabase.__lastCall('bookings', 'select').filters).toContainEqual({
      method: 'eq',
      column: 'guest_id',
      value: 'user-42',
    })
  })

  it('scopes listing queries to the signed-in host', async () => {
    givenSignedIn('user-42')
    givenData({ isHost: true })
    await renderHosting()

    expect(supabase.__lastCall('listings', 'select').filters).toContainEqual({
      method: 'eq',
      column: 'host_id',
      value: 'user-42',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('my_account')
  })

  it('reports a load failure on hosting', async () => {
    givenData({ isHost: true })
    supabase.__on('listings', 'select', { data: null, error: { message: 'permission denied' } })
    await renderHosting()

    expect(screen.getByText('Something went wrong loading this page. Please refresh.')).toBeInTheDocument()
    expect(screen.queryByText('permission denied')).not.toBeInTheDocument()
  })

  it('reports a load failure on bookings', async () => {
    supabase.__on('bookings', 'select', { data: null, error: { message: 'permission denied' } })
    await renderBookings()

    expect(screen.getByText('Something went wrong loading this page. Please refresh.')).toBeInTheDocument()
    expect(screen.queryByText('permission denied')).not.toBeInTheDocument()
  })
})

describe('Dashboard verification review', () => {
  it('offers a slim review banner to an admin when submissions are waiting', async () => {
    givenRpc(async (name) => {
      if (name === 'my_verification') {
        return { data: [{ is_admin: true, pending_count: 3 }], error: null }
      }
      return { data: null, error: null }
    })
    givenData({ isHost: true })
    await renderHosting()

    expect(screen.getByRole('status')).toHaveTextContent('3 verifications waiting · Review')
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/admin/verifications'
    )
  })

  it('hides the banner when an admin has an empty queue', async () => {
    givenRpc(async (name) => {
      if (name === 'my_verification') {
        return { data: [{ is_admin: true, pending_count: 0 }], error: null }
      }
      return { data: null, error: null }
    })
    givenData({ isHost: true })
    await renderHosting()

    expect(screen.queryByRole('link', { name: 'Review' })).not.toBeInTheDocument()
    expect(screen.queryByText(/verifications waiting/)).not.toBeInTheDocument()
  })

  it('keeps the review queue off a host dashboard', async () => {
    givenData({ isHost: true })
    await renderHosting()

    expect(screen.queryByRole('link', { name: 'Review' })).not.toBeInTheDocument()
  })
})

describe('Dashboard empty states', () => {
  it('shows an empty bookings state', async () => {
    await renderBookings()

    expect(screen.getByText('No bookings yet.')).toBeInTheDocument()
  })

  it('shows empty host sections', async () => {
    givenData({ isHost: true })
    await renderHosting()

    expect(screen.queryByRole('heading', { name: 'Upcoming bookings' })).not.toBeInTheDocument()
    const listings = sectionFor('Your listings')
    expect(within(listings).getByRole('link', { name: 'Create one' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(screen.getByRole('link', { name: 'New listing' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
  })
})

describe('Dashboard listings', () => {
  it('lists the host listings with a thumbnail, Add dates, and Edit listing', async () => {
    givenData({ listings: [makeMyListing({ id: 'listing-9', title: 'Boxing' })] })
    await renderHosting()

    const card = listingCard('Boxing')
    expect(within(card).getByRole('link', { name: 'Edit listing' })).toHaveAttribute(
      'href',
      '/edit-listing/listing-9'
    )
    expect(card.querySelector('.hosting-listing__thumb')).toHaveAttribute(
      'src',
      'https://cdn.test/latte.jpg'
    )
    expect(within(card).getByRole('button', { name: 'Add dates' }).className).toContain(
      'host-dates__add'
    )
    expect(screen.getByRole('link', { name: 'New listing' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(card.querySelector('.hosting-listing__text')).toBeInTheDocument()
    expect(card.querySelector('.hosting-listing__menu')).toBeInTheDocument()
    expect(card.className).toContain('hosting-listing-card')
  })

  it('keeps thumbnail and title on one line, and one listing per row', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    const main = [...css.matchAll(/^\.hosting-listing__main \{[\s\S]*?\n\}/gm)].find((match) =>
      match[0].includes('grid-template-areas'),
    )
    const text = css.match(/\.hosting-listing__text \{[\s\S]*?\n\}/)
    const listings = css.match(/\.dashboard-list--listings \{[\s\S]*?\n\}/)
    expect(main?.[0]).toMatch(/grid-template-areas:[\s\S]*'thumb text'/)
    expect(text?.[0]).toMatch(/min-width:\s*0/)
    // Wide cards put the tools beside the title, and the dates in a row.
    expect(css).toMatch(/@container \(min-width: 600px\) \{[\s\S]*?grid-template-areas: 'thumb text tools'/)
    expect(css).toMatch(/@container \(min-width: 600px\) \{[\s\S]*?grid-template-areas: 'when meta action'/)
    expect(listings?.[0]).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(listings?.[0]).toMatch(/align-items:\s*start/)
    expect(css).toMatch(
      /\.dashboard-card\.hosting-listing-card:has\(\.ui-overflow__menu\) \{[^}]*z-index:\s*30;/
    )
    expect(css).toMatch(/\.ui-overflow__menu \{[^}]*opacity:\s*1;/)
    expect(css).toMatch(/\.ui-overflow__item \{[^}]*background-color:\s*var\(--bg-elevated\);/)
  })

  it('keeps view and delete behind the overflow menu', async () => {
    givenData({ listings: [makeMyListing({ id: 'listing-9', title: 'Boxing' })] })
    const { user } = await renderHosting()

    expect(screen.queryByRole('menuitem', { name: 'View listing' })).not.toBeInTheDocument()
    await openListingMenu(user, 'Boxing')

    expect(screen.getByRole('menuitem', { name: 'View listing' })).toHaveAttribute(
      'href',
      '/listings/listing-9'
    )
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' }).className).toContain(
      'ui-overflow__item--destructive'
    )
  })

  it('deactivates a listing through delete_listing rather than a client update', async () => {
    givenData({ listings: [makeMyListing()] })
    givenRpc(async (name, args) => {
      if (name === 'delete_listing') return { data: args.p_listing_id, error: null }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()

    await openDeleteListing(user)
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('delete_listing', { p_listing_id: 'listing-1' })
    )
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })

  it('asks only to delete when the listing has no upcoming sessions', async () => {
    givenData({ listings: [makeMyListing()] })
    const { user } = await renderHosting()

    await openDeleteListing(user)

    expect(screen.getByRole('dialog')).toHaveTextContent("Delete 'Latte art'? This can't be undone.")
    expect(screen.getByRole('dialog')).not.toHaveTextContent('will be removed too')
  })

  it('removes empty upcoming sessions when the listing is deleted', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({ id: 's-empty-1', bookings: [] }),
        makeHostSession({ id: 's-empty-2', bookings: [] }),
      ],
    })
    givenRpc(async (name, args) => {
      if (name === 'delete_listing') return { data: args.p_listing_id, error: null }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()

    await openDeleteListing(user)
    expect(screen.getByRole('dialog')).toHaveTextContent(
      "Delete 'Latte art'? This can't be undone. Its 2 upcoming sessions will be removed too."
    )

    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => expect(screen.queryByText('Latte art')).not.toBeInTheDocument())
    expect(supabase.rpc).toHaveBeenCalledWith('delete_listing', { p_listing_id: 'listing-1' })
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })

  it('refuses delete when an upcoming session has an active booking', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [makeHostSession()],
    })
    const { user } = await renderHosting()

    await openDeleteListing(user)

    expect(screen.getByRole('dialog')).toHaveTextContent(
      "'Latte art' has 1 upcoming booking. Cancel those sessions first. Guests are refunded in full."
    )
    expect(screen.queryByRole('button', { name: 'Confirm delete' })).not.toBeInTheDocument()
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'delete_listing')).toBe(false)
  })

  it('removes the listing from the page once deleted', async () => {
    givenData({ listings: [makeMyListing()] })
    givenRpc(async (name, args) => {
      if (name === 'delete_listing') return { data: args.p_listing_id, error: null }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()

    await openDeleteListing(user)
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => expect(screen.queryByText('Latte art')).not.toBeInTheDocument())
  })

  it('keeps the listing when the host backs out', async () => {
    givenData({ listings: [makeMyListing()] })
    const { user } = await renderHosting()

    await openDeleteListing(user)
    await user.click(screen.getByRole('button', { name: 'Keep listing' }))

    expect(supabase.rpc.mock.calls.some(([name]) => name === 'delete_listing')).toBe(false)
    expect(listingCard('Latte art')).toBeInTheDocument()
  })

  it('maps an active-bookings RPC error to a cancel-those-sessions line', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    givenData({ listings: [makeMyListing()] })
    givenRpc(async (name) => {
      if (name === 'delete_listing') {
        return { data: null, error: { message: 'listing has active bookings' } }
      }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()

    await openDeleteListing(user)
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(LISTING_DELETE_ACTIVE_BOOKINGS)
    expect(log).toHaveBeenCalledWith(
      'Listing delete failed',
      expect.objectContaining({ message: 'listing has active bookings' }),
    )
    expect(listingCard('Latte art')).toBeInTheDocument()
    log.mockRestore()
  })

  it('reports a failed deletion as a retry line', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    givenData({ listings: [makeMyListing()] })
    givenRpc(async (name) => {
      if (name === 'delete_listing') {
        return { data: null, error: { message: 'not your listing' } }
      }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()

    await openDeleteListing(user)
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(LISTING_DELETE_FAILED)
    expect(log).toHaveBeenCalledWith(
      'Listing delete failed',
      expect.objectContaining({ message: 'not your listing' }),
    )
    expect(listingCard('Latte art')).toBeInTheDocument()
    log.mockRestore()
  })
})

describe('Dashboard add session', () => {
  beforeEach(() => {
    givenData({ listings: [makeMyListing()] })
  })

  async function openSessionForm(user) {
    await user.click(screen.getByRole('button', { name: 'Add dates' }))
  }

  async function addOtherTime(user, time) {
    await user.click(screen.getByRole('button', { name: 'Other time' }))
    fireEvent.change(screen.getByLabelText('Other start time'), { target: { value: time } })
    await user.click(screen.getByRole('button', { name: 'Add', exact: true }))
  }

  async function fillSession(user, { daysAhead = 1, time = '10:30' } = {}) {
    const dateKey = dateKeyFromToday(daysAhead)
    await user.click(screen.getByRole('button', { name: 'Pick dates' }))
    await selectCalendarDate(user, dateKey)
    await addOtherTime(user, time)
    return dateKey
  }

  async function reviewAndCreate(user) {
    await user.click(screen.getByRole('button', { name: /^Add \d+ sessions?$/ }))
  }

  const sheet = () => screen.queryByRole('dialog', { name: 'Add dates' })

  it('still lists the host listings when duration_mins is not in the database yet', async () => {
    supabase.__on('listings', 'select', (call) => {
      const selected = String(call.chain.find((step) => step.method === 'select')?.args[0] ?? '')
      if (selected.includes('duration_mins')) {
        return { data: null, error: { message: 'column listings.duration_mins does not exist' } }
      }
      const listing = makeMyListing()
      delete listing.duration_mins
      return { data: [listing], error: null }
    })
    const { user } = await renderHosting()

    expect(screen.queryByText(/duration_mins does not exist/)).not.toBeInTheDocument()
    expect(listingCard('Latte art')).toBeInTheDocument()

    await openSessionForm(user)
    expect(screen.getByLabelText(/How long is each session/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/How long is each session/), { target: { value: '60' } })
    await fillSession(user)

    await reviewAndCreate(user)

    await waitFor(() => expect(supabase.__calls('sessions', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('sessions', 'insert').payload).toMatchObject({
      listing_id: 'listing-1',
      duration_mins: 60,
      spots_total: 4,
      spots_remaining: 4,
      status: 'open',
    })
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'add_listing_session')).toBe(false)
  })

  it('reopens Add sessions with the same picks after the host leaves and comes back', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    const first = await renderHosting()
    await openSessionForm(first.user)
    await fillSession(first.user, { daysAhead: 2, time: '14:15' })
    first.unmount()

    const { user } = await renderHosting()

    expect(await screen.findByRole('button', { name: '2:15 pm' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Pick dates' })).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: new RegExp(formatDayLabel(dateKeyFromToday(2))) }),
    ).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled())

    await user.click(within(sheet()).getByRole('button', { name: 'Close' }))
    expect(sheet()).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem('trykai:add-sessions:listing-1')).toBeNull()
    expect(window.sessionStorage.getItem('trykai:add-sessions:open')).toBeNull()
    delete HTMLElement.prototype.scrollIntoView
  })

  it('forgets an open form whose listing is gone', async () => {
    window.sessionStorage.setItem('trykai:add-sessions:open', 'deleted-listing')
    await renderHosting()

    await waitFor(() =>
      expect(window.sessionStorage.getItem('trykai:add-sessions:open')).toBeNull(),
    )
    expect(sheet()).not.toBeInTheDocument()
  })

  it('shows the listing duration and does not ask for one', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)

    expect(
      screen.getByText('Each session runs 1 hr 30 min. Pick one or more start times.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/How long is each session/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Spots total')).not.toBeInTheDocument()
  })

  it('stores the start time as UTC converted from Singapore time', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    const dateKey = await fillSession(user, { time: '10:30' })

    await reviewAndCreate(user)

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('add_listing_session', {
        p_listing_id: 'listing-1',
        p_starts_at: `${dateKey}T02:30:00.000Z`,
        p_spots: 4,
      })
    )
    expect(supabase.__calls('sessions', 'insert')).toHaveLength(0)
  })

  it('sends the listing spots and lets the database set the length', async () => {
    givenData({ listings: [makeMyListing({ max_guests: 6 })] })
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user)

    await reviewAndCreate(user)

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    const [, args] = supabase.rpc.mock.calls.find(([name]) => name === 'add_listing_session')
    expect(args.p_spots).toBe(6)
    expect(args).not.toHaveProperty('duration_mins')
  })

  it('sends the chosen session type and shows it on the session row', async () => {
    supabase.__on('listing_session_types', 'select', {
      data: [
        { id: 't1', listing_id: 'listing-1', name: 'Hand-tied bouquet', description: '', photo_url: null, position: 0, is_active: true },
        { id: 't2', listing_id: 'listing-1', name: 'Table centrepiece', description: '', photo_url: null, position: 1, is_active: true },
      ],
      error: null,
    })
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        {
          id: 'session-typed',
          listing_id: 'listing-1',
          starts_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          duration_mins: 90,
          status: 'open',
          type_id: 't2',
          bookings: [],
        },
      ],
    })
    const { user } = await renderHosting()
    expect(await screen.findByText('Table centrepiece')).toBeInTheDocument()
    await openSessionForm(user)
    await user.click(screen.getByRole('radio', { name: 'Hand-tied bouquet' }))
    await fillSession(user)
    await reviewAndCreate(user)

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    const [, args] = supabase.rpc.mock.calls.find(([name]) => name === 'add_listing_session')
    expect(args.p_type_id).toBe('t1')
  })

  it('offers the same times on another listing, with that listing\'s spots', async () => {
    givenData({
      listings: [makeMyListing(), makeMyListing({ id: 'listing-2', title: 'Pottery', max_guests: 6 })],
    })
    const { user } = await renderHosting()
    await user.click(within(listingCard('Latte art')).getByRole('button', { name: 'Add dates' }))
    const dateKey = await fillSession(user, { time: '10:30' })
    await user.click(screen.getByRole('switch', { name: 'Also offer these times on Pottery' }))
    expect(screen.getByText(/on 2 listings/)).toBeInTheDocument()
    await reviewAndCreate(user)

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('add_listing_session', {
        p_listing_id: 'listing-2',
        p_starts_at: `${dateKey}T02:30:00.000Z`,
        p_spots: 6,
      })
    )
    expect(supabase.rpc).toHaveBeenCalledWith('add_listing_session', {
      p_listing_id: 'listing-1',
      p_starts_at: `${dateKey}T02:30:00.000Z`,
      p_spots: 4,
    })
    expect(await screen.findByText(/Also added on Pottery\./)).toBeInTheDocument()
    const notified = supabase.functions.invoke.mock.calls
      .filter(([name]) => name === 'notify-interested')
      .map(([, options]) => options.body.listing_id)
    expect(notified).toEqual(['listing-1', 'listing-2'])
  })

  it('says when the other listing refused the times', async () => {
    givenData({
      listings: [makeMyListing(), makeMyListing({ id: 'listing-2', title: 'Pottery' })],
    })
    const previous = supabase.rpc.getMockImplementation()
    supabase.rpc.mockImplementation(async (name, args) =>
      name === 'add_listing_session' && args.p_listing_id === 'listing-2'
        ? { data: null, error: { message: 'That time overlaps the session on Sat' } }
        : previous(name, args)
    )
    const { user } = await renderHosting()
    await user.click(within(listingCard('Latte art')).getByRole('button', { name: 'Add dates' }))
    await fillSession(user)
    await user.click(screen.getByRole('switch', { name: /Pottery/ }))
    await reviewAndCreate(user)

    expect(await screen.findByText(/None added on Pottery/)).toBeInTheDocument()
  })

  it('does not offer other listings when the host has only one', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    expect(screen.queryByText(/Also offer these times on/)).not.toBeInTheDocument()
  })

  it('emails keen guests after sessions are added and says how many', async () => {
    supabase.functions.invoke.mockImplementation(async (name) =>
      name === 'notify-interested' ? { data: { notified: 3 }, error: null } : { data: null, error: null }
    )
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user)
    await reviewAndCreate(user)

    await waitFor(() =>
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'notify-interested',
        expect.objectContaining({ body: { listing_id: 'listing-1' } })
      )
    )
    expect(await screen.findByText(/We've emailed the 3 guests who were keen\./)).toBeInTheDocument()
  })

  it('does not mention keen guests when nobody was waiting', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { notified: 0 }, error: null })
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user)
    await reviewAndCreate(user)

    await waitFor(() =>
      expect(supabase.functions.invoke.mock.calls.some(([name]) => name === 'notify-interested')).toBe(true)
    )
    expect(screen.queryByText(/who were keen|who was keen/)).not.toBeInTheDocument()
  })

  it('skips a time that is already on instead of stacking its spots', async () => {
    const dateKey = dateKeyFromToday(1)
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({
          starts_at: `${dateKey}T02:30:00.000Z`,
          duration_mins: 90,
          status: 'open',
          bookings: [],
        }),
      ],
    })
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user, { time: '10:30' })

    expect(screen.getByText('Skipped: already on at this time')).toBeInTheDocument()
    expect(screen.queryByText(/more spots/)).not.toBeInTheDocument()
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
    await user.click(within(sheet()).getByRole('button', { name: 'Add sessions' }))
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'add_listing_session')).toBe(false)
  })

  it('skips a date that overlaps another class, and says why', async () => {
    const dateKey = dateKeyFromToday(1)
    supabase.__on('listing_session_types', 'select', {
      data: [
        { id: 't1', listing_id: 'listing-1', name: 'Hand-tied bouquet', description: '', photo_url: null, position: 0, is_active: true },
        { id: 't2', listing_id: 'listing-1', name: 'Table centrepiece', description: '', photo_url: null, position: 1, is_active: true },
      ],
      error: null,
    })
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({ starts_at: `${dateKey}T02:00:00.000Z`, duration_mins: 90, type_id: 't2', bookings: [] }),
      ],
    })
    const { user } = await renderHosting()
    await openSessionForm(user)
    await user.click(screen.getByRole('radio', { name: 'Hand-tied bouquet' }))
    expect(screen.getByRole('heading', { name: 'Adding · Hand-tied bouquet' })).toBeInTheDocument()
    await fillSession(user, { time: '10:30' })

    expect(screen.getByText('Skipped: Table centrepiece runs then')).toBeInTheDocument()
    expect(
      screen.getByText('You can only teach one class at a time, so dates that overlap another class are skipped.'),
    ).toBeInTheDocument()
  })

  function givenTwoClasses() {
    supabase.__on('listing_session_types', 'select', {
      data: [
        { id: 't1', listing_id: 'listing-1', name: 'Hand-tied bouquet', description: '', photo_url: null, position: 0, is_active: true },
        { id: 't2', listing_id: 'listing-1', name: 'Table centrepiece', description: '', photo_url: null, position: 1, is_active: true },
      ],
      error: null,
    })
  }

  it('offers the next class once a batch is added', async () => {
    givenTwoClasses()
    const { user } = await renderHosting()
    await openSessionForm(user)
    await user.click(screen.getByRole('radio', { name: 'Hand-tied bouquet' }))
    await fillSession(user)
    await reviewAndCreate(user)

    const offer = await screen.findByRole('button', { name: 'Add dates for Table centrepiece' })
    await user.click(offer)
    expect(screen.getByRole('radio', { name: 'Table centrepiece' })).toBeChecked()
    expect(screen.getByRole('heading', { name: 'Adding · Table centrepiece' })).toBeInTheDocument()
  })

  it('opens Add dates on a class from Edit listing', async () => {
    givenTwoClasses()
    const { currentSearch } = await renderHosting({ route: '/hosting?add=listing-1&class=t2' })

    expect(await screen.findByRole('dialog', { name: 'Add dates' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Table centrepiece' })).toBeChecked()
    await waitFor(() => expect(currentSearch()).not.toContain('add='))
  })

  it('makes a new class without leaving the sheet', async () => {
    givenTwoClasses()
    supabase.__on('listing_session_types', 'insert', {
      data: { id: 't3', listing_id: 'listing-1', name: 'Wreath', description: '', photo_url: null, position: 2, is_active: true },
      error: null,
    })
    const { user } = await renderHosting()
    await openSessionForm(user)
    await user.click(screen.getByRole('button', { name: 'New class' }))
    await user.type(screen.getByLabelText('Class name'), 'Wreath')
    await user.click(screen.getByRole('button', { name: 'Add class' }))

    expect(await screen.findByRole('radio', { name: 'Wreath' })).toBeChecked()
    expect(supabase.__lastCall('listing_session_types', 'insert').payload).toMatchObject({
      listing_id: 'listing-1',
      name: 'Wreath',
      position: 2,
    })
  })

  it('points a listing without classes to where they are set up', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    expect(screen.getByText('Teach more than one class here?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set up classes' })).toHaveAttribute(
      'href',
      '/edit-listing/listing-1?section=types',
    )
  })

  it('skips a date that overlaps an existing session of its own', async () => {
    const dateKey = dateKeyFromToday(1)
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({
          starts_at: `${dateKey}T02:00:00.000Z`,
          duration_mins: 90,
          bookings: [],
        }),
      ],
    })
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user, { time: '10:30' })

    expect(screen.getByText('Skipped: clashes with an existing session')).toBeInTheDocument()
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
    await user.click(within(sheet()).getByRole('button', { name: 'Add sessions' }))
    expect(screen.getByRole('alert')).toHaveTextContent('None of these can be added.')
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'add_listing_session')).toBe(false)
  })

  it('rejects a session with no date or time', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Add sessions' }))

    expect(await screen.findByText('Pick at least one day and a start time.')).toBeInTheDocument()
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'add_listing_session')).toBe(false)
  })

  it('does not let the host pick today or a date 81 days out', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    await user.click(screen.getByRole('button', { name: 'Pick dates' }))

    const todayButton = screen.queryByRole('button', {
      name: new RegExp(formatDayLabel(dateKeyFromToday(0))),
    })
    if (todayButton) expect(todayButton).toBeDisabled()

    const lastAllowed = dateKeyFromToday(80)
    const tooFar = dateKeyFromToday(81)
    for (let i = 0; i < 4; i += 1) {
      if (screen.queryByRole('button', { name: new RegExp(formatDayLabel(lastAllowed)) })) break
      const next = screen.getByRole('button', { name: 'Next month' })
      if (next.disabled) break
      await user.click(next)
    }
    expect(screen.getByRole('button', { name: new RegExp(formatDayLabel(lastAllowed)) })).toBeEnabled()

    if (!screen.queryByRole('button', { name: new RegExp(formatDayLabel(tooFar)) })) {
      const next = screen.getByRole('button', { name: 'Next month' })
      if (!next.disabled) await user.click(next)
    }
    const blocked = screen.queryByRole('button', { name: new RegExp(formatDayLabel(tooFar)) })
    if (blocked) expect(blocked).toBeDisabled()
  })

  it('asks the host to set listing spots when max_guests is missing', async () => {
    givenData({ listings: [makeMyListing({ max_guests: null })] })
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user)
    await reviewAndCreate(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Set spots per session in listing settings first.',
    )
    expect(screen.getByRole('link', { name: 'Change spots' })).toHaveAttribute(
      'href',
      '/edit-listing/listing-1?section=price',
    )
  })

  it('closes the form after a successful save', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user)

    await reviewAndCreate(user)

    await waitFor(() => expect(sheet()).not.toBeInTheDocument())
  })

  it('puts a server overlap into the skipped summary instead of a generic error', async () => {
    givenRpc(async (name) => {
      if (name === 'add_listing_session') {
        return {
          data: null,
          error: {
            message: 'That time overlaps the session on Fri, 9 Oct at 11:11 am (90 mins).',
          },
        }
      }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user)

    await reviewAndCreate(user)

    expect(await screen.findByText(/Created 0 sessions\. Skipped 1:/)).toBeInTheDocument()
    expect(screen.getByText(/clashes with an existing session/)).toBeInTheDocument()
    expect(
      screen.queryByText('That time overlaps the session on Fri, 9 Oct at 11:11 am (90 mins).')
    ).not.toBeInTheDocument()
  })

  it('previews an in-batch clash and still creates the earlier time', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user, { time: '10:00' })
    await addOtherTime(user, '10:30')

    expect(screen.getByText('Skipped: clashes with another session in this batch')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add 1 session' }))

    await waitFor(() =>
      expect(
        supabase.rpc.mock.calls.filter(([name]) => name === 'add_listing_session')
      ).toHaveLength(1)
    )
    expect(await screen.findByText(/Created 1 session\. Skipped 1:/)).toBeInTheDocument()
  })

  it('adds Sat and Sun every week for two weeks at two times', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)

    await user.click(screen.getByRole('button', { name: 'Sat' }))
    await user.click(screen.getByRole('button', { name: 'Sun' }))
    await user.click(screen.getByRole('button', { name: '2 weeks' }))
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    await user.click(screen.getByRole('button', { name: '2:00 pm' }))

    expect(screen.getByRole('button', { name: 'Add 8 sessions' })).toBeInTheDocument()
    expect(screen.getByText('32 spots for guests to book')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'See all 8' }))
    expect(sheet().querySelectorAll('.add-dates__row-day')).toHaveLength(8)

    await user.click(screen.getByRole('button', { name: 'Add 8 sessions' }))
    await waitFor(() =>
      expect(supabase.rpc.mock.calls.filter(([name]) => name === 'add_listing_session')).toHaveLength(8),
    )
  })

  it('creates the per-date starts, not a shared time on every date', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    const first = dateKeyFromToday(1)
    const second = dateKeyFromToday(2)
    await user.click(screen.getByRole('button', { name: 'Pick dates' }))
    await selectCalendarDate(user, first)
    await selectCalendarDate(user, second)
    await user.click(screen.getByRole('button', { name: '10:00 am' }))
    await user.click(screen.getByRole('button', { name: '2:00 pm' }))
    await user.click(screen.getByRole('button', { name: 'Different times on different days?' }))
    const secondRow = screen.getByRole('group', { name: formatDayTitle(second) })
    fireEvent.change(within(secondRow).getByLabelText('Time'), { target: { value: '15:00' } })
    const timeRemoves = within(secondRow).getAllByRole('button', { name: 'Remove' })
    await user.click(timeRemoves[timeRemoves.length - 1])

    await reviewAndCreate(user)

    await waitFor(() =>
      expect(
        supabase.rpc.mock.calls.filter(([name]) => name === 'add_listing_session'),
      ).toHaveLength(3),
    )
    const starts = supabase.rpc.mock.calls
      .filter(([name]) => name === 'add_listing_session')
      .map(([, args]) => args.p_starts_at)
      .sort()
    expect(starts).toEqual(
      [`${first}T02:00:00.000Z`, `${first}T06:00:00.000Z`, `${second}T07:00:00.000Z`].sort(),
    )
  })
})

describe('Dashboard guest cancellation', () => {
  it('offers cancellation for an upcoming confirmed booking', async () => {
    givenData({ bookings: [makeBooking()] })
    await renderBookings()

    expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
  })

  it('links each booking card to its detail page', async () => {
    givenData({ bookings: [makeBooking()] })
    await renderBookings()

    expect(screen.getByRole('link', { name: 'Learn latte art with me' })).toHaveAttribute(
      'href',
      '/bookings/booking-1',
    )
  })

  it('does not offer cancellation once the session has passed', async () => {
    givenData({
      bookings: [makeBooking({ sessions: { starts_at: hoursFromNow(-2), listings: {} } })],
    })
    await renderBookings()

    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('does not offer cancellation for an already cancelled booking', async () => {
    givenData({
      bookings: [makeBooking({ status: 'cancelled', stripe_charge_id: 'ch_1' })],
    })
    await renderBookings()

    expect(screen.getByText('Learn latte art with me')).toBeInTheDocument()
    expect(screen.getByText(/1 guest/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('shows Unknown listing / Date TBC when the nested session is missing', async () => {
    givenData({ bookings: [makeBooking({ sessions: null })] })
    await renderBookings()

    expect(screen.getByText('Unknown listing')).toBeInTheDocument()
    expect(screen.getByText(/Date TBC/)).toBeInTheDocument()
    expect(screen.getByText(/1 guest/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('still offers cancellation when the booked session is full', async () => {
    givenData({
      bookings: [
        makeBooking({
          sessions: {
            starts_at: hoursFromNow(72),
            spots_remaining: 0,
            listings: { title: 'Latte art', host_id: HOST_ID },
          },
        }),
      ],
    })
    await renderBookings()

    expect(screen.getByText('Latte art')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
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
    await renderBookings()

    expect(supabase.__lastCall('bookings', 'select').chain[0].args[0]).toContain('platform_fee')
  })

  it.each([
    [72, "Refund of $38.25. The booking fee isn't refunded"],
    [30, 'Partial refund of $19.13 — 50% of the session and add-ons'],
    [12, 'Partial refund of $9.56 — 25% of the session and add-ons'],
    [3, 'No refund (cancelled less than 6 hours before the session).'],
  ])('quotes the published refund %i hours before the session', async (hours, quote) => {
    givenData({ bookings: [bookingCancelledAt(hours)] })
    const { user } = await renderBookings()

    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))

    expect(screen.getByText(new RegExp(quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
  })

  it('asks the cancel-booking function to refund the guest', async () => {
    givenData({ bookings: [makeBooking()] })
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, refund_amount: 4500 }, error: null })
    const { user } = await renderBookings()

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
    const { user } = await renderBookings()

    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))

    expect(await screen.findByText('already cancelled')).toBeInTheDocument()
  })
})

function dateLabel(session, listing = makeMyListing()) {
  return `${sessionDayLabel(session.starts_at)}, ${sessionTimeRange(session, listing)}`
}

async function openDateMenu(user, session) {
  await user.click(screen.getByRole('button', { name: `Options for ${dateLabel(session)}` }))
}

function dateRows(card) {
  return [...card.querySelectorAll('.host-date:not(.host-date--more)')]
}

async function renderSessionPage(sessionId, options = {}) {
  const utils = renderWithRouter(
    <RequireAuth>
      <Hosting />
    </RequireAuth>,
    { route: `/hosting?session=${sessionId}`, path: '/hosting', ...options },
  )
  await screen.findByRole('link', { name: /Back to Hosting/ })
  return utils
}

describe('Hosting upcoming dates', () => {
  it('lists booked and open dates together in date order, each with its own way in', async () => {
    const open = makeHostSession({ id: 's-open', starts_at: hoursFromNow(30), bookings: [] })
    const booked = makeHostSession({
      id: 's-booked',
      starts_at: hoursFromNow(80),
      bookings: [{ id: 'b-1', status: 'confirmed', guests_count: 1, total_amount: 4500 }],
    })
    givenData({ listings: [makeMyListing()], hostSessions: [booked, open] })
    await renderHosting()

    const card = listingCard('Latte art')
    expect(within(card).getByText('1 with bookings · 1 open')).toBeInTheDocument()
    const [first, second] = dateRows(card)
    expect(first).toHaveTextContent(sessionDayLabel(open.starts_at))
    expect(within(first).getByText('Open · 4 spots')).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: `Options for ${dateLabel(open)}` })).toBeInTheDocument()
    expect(within(second).getByText('1 of 4 booked')).toBeInTheDocument()
    expect(within(second).getByRole('link', { name: /Guests and details/ })).toHaveAttribute(
      'href',
      '/hosting?session=s-booked',
    )
    expect(within(second).queryByRole('button', { name: /^Options for/ })).not.toBeInTheDocument()
  })

  it('does not treat an unpaid checkout as a booking, and keeps its time fixed', async () => {
    const pending = makeHostSession({
      bookings: [{ id: 'b-pending', status: 'pending', guests_count: 1, total_amount: 4500 }],
    })
    givenData({ listings: [makeMyListing()], hostSessions: [pending] })
    const { user } = await renderHosting()

    expect(screen.queryByRole('heading', { name: 'Next up' })).not.toBeInTheDocument()
    expect(within(listingCard('Latte art')).getByText('Open · 4 spots')).toBeInTheDocument()
    await openDateMenu(user, pending)
    expect(screen.queryByRole('menuitem', { name: 'Change time' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument()
  })

  it('excludes cancelled sessions from the upcoming list', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [] })
    await renderHosting()

    expect(supabase.__lastCall('sessions', 'select').filters).toContainEqual({
      method: 'neq',
      column: 'status',
      value: 'cancelled',
    })
  })

  it('removes an open date with a moment to undo, then deletes it', async () => {
    const open = makeHostSession({ bookings: [] })
    givenData({ listings: [makeMyListing()], hostSessions: [open] })
    givenRpc(async (name) =>
      name === 'delete_empty_session' ? { data: 'session-1', error: null } : { data: null, error: null },
    )
    const { user } = await renderHosting()
    const deletes = () => supabase.rpc.mock.calls.filter(([name]) => name === 'delete_empty_session')

    await openDateMenu(user, open)
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))

    expect(dateRows(listingCard('Latte art'))).toHaveLength(0)
    expect(screen.getByText(`Removed ${dateLabel(open)}.`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus()
    expect(deletes()).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(dateRows(listingCard('Latte art'))).toHaveLength(1)
    expect(deletes()).toHaveLength(0)

    await openDateMenu(user, open)
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(deletes()).toHaveLength(1))
    expect(supabase.rpc).toHaveBeenCalledWith('delete_empty_session', { p_session_id: 'session-1' })
    expect(dateRows(listingCard('Latte art'))).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('still deletes a removed date when the host leaves before it is done', async () => {
    const open = makeHostSession({ bookings: [] })
    givenData({ listings: [makeMyListing()], hostSessions: [open] })
    givenRpc(async () => ({ data: null, error: null }))
    const { user, unmount } = await renderHosting()

    await openDateMenu(user, open)
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))
    unmount()

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('delete_empty_session', { p_session_id: 'session-1' }),
    )
  })

  it('puts a date back and says why when it cannot be removed', async () => {
    const open = makeHostSession({ bookings: [] })
    givenData({ listings: [makeMyListing()], hostSessions: [open] })
    givenRpc(async (name) =>
      name === 'delete_empty_session'
        ? { data: null, error: { message: 'not allowed' } }
        : { data: null, error: null },
    )
    const { user } = await renderHosting()

    await openDateMenu(user, open)
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(await screen.findByText('not allowed')).toBeInTheDocument()
    expect(dateRows(listingCard('Latte art'))).toHaveLength(1)
  })

  it('moves an open date through edit_open_session', async () => {
    const open = makeHostSession({ bookings: [] })
    givenData({ listings: [makeMyListing()], hostSessions: [open] })
    givenRpc(async (name) =>
      name === 'edit_open_session' ? { data: 'session-1', error: null } : { data: null, error: null },
    )
    const { user } = await renderHosting()

    await openDateMenu(user, open)
    await user.click(screen.getByRole('menuitem', { name: 'Change time' }))
    const dateKey = dateKeyFromToday(2)
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: dateKey } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '15:00' } })
    await user.click(screen.getByRole('button', { name: 'Save time' }))

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('edit_open_session', {
        p_session_id: 'session-1',
        p_starts_at: `${dateKey}T07:00:00.000Z`,
      }),
    )
  })

  it('keeps the date and explains when a booking wins the race', async () => {
    const open = makeHostSession({ bookings: [] })
    givenData({ listings: [makeMyListing()], hostSessions: [open] })
    givenRpc(async (name) =>
      name === 'edit_open_session'
        ? { data: null, error: { message: 'session_has_bookings' } }
        : { data: null, error: null },
    )
    const { user } = await renderHosting()

    await openDateMenu(user, open)
    await user.click(screen.getByRole('menuitem', { name: 'Change time' }))
    await user.click(screen.getByRole('button', { name: 'Save time' }))

    expect(
      await screen.findByText("Someone just started booking this session, so it can't be edited."),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save time' })).toBeInTheDocument()
  })

  it('shows five dates, then the rest on request', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [1, 2, 3, 4, 5, 6, 7].map((day) =>
        makeHostSession({ id: `open-${day}`, starts_at: hoursFromNow(24 * day + 2), bookings: [] }),
      ),
    })
    const { user } = await renderHosting()
    const card = listingCard('Latte art')

    expect(dateRows(card)).toHaveLength(5)
    await user.click(within(card).getByRole('button', { name: 'Show all 7 dates' }))
    expect(dateRows(card)).toHaveLength(7)
    await user.click(within(card).getByRole('button', { name: 'Show fewer' }))
    expect(dateRows(card)).toHaveLength(5)
  })

  it('omits a dangling separator when the listing has no area', async () => {
    // Without price, length or group size the card falls back to category and area.
    givenData({
      listings: [makeMyListing({ area: '', title: 'No area yet', duration_mins: null, max_guests: null })],
    })
    await renderHosting()

    expect(listingCard('No area yet').querySelector('.hosting-listing__facts')).toHaveTextContent(
      /^Food$/,
    )
  })

  it('selects open dates to remove together and leaves booked ones alone', async () => {
    const first = makeHostSession({ id: 'empty-1', starts_at: hoursFromNow(26), bookings: [] })
    const second = makeHostSession({ id: 'empty-2', starts_at: hoursFromNow(50), bookings: [] })
    const booked = makeHostSession({
      id: 'booked',
      starts_at: hoursFromNow(74),
      bookings: [{ id: 'b-1', status: 'confirmed', guests_count: 2 }],
    })
    givenData({ listings: [makeMyListing()], hostSessions: [first, second, booked] })
    givenRpc(async (name) =>
      name === 'delete_empty_session' ? { data: true, error: null } : { data: null, error: null },
    )
    const { user } = await renderHosting()
    const card = listingCard('Latte art')

    await user.click(within(card).getByRole('button', { name: 'Select' }))
    expect(within(card).getByText('Pick open dates to remove. Booked dates stay.')).toBeInTheDocument()
    expect(within(card).queryByLabelText(`Select ${dateLabel(booked)}`)).not.toBeInTheDocument()
    await user.click(within(card).getByLabelText(`Select ${dateLabel(first)}`))
    await user.click(within(card).getByLabelText(`Select ${dateLabel(second)}`))
    await user.click(within(card).getByRole('button', { name: 'Remove 2 dates' }))

    expect(within(card).getByText('Removed 2 dates.')).toBeInTheDocument()
    expect(dateRows(card)).toHaveLength(1)
    await user.click(within(card).getByRole('button', { name: 'Dismiss' }))

    await waitFor(() =>
      expect(supabase.rpc.mock.calls.filter(([name]) => name === 'delete_empty_session')).toHaveLength(2),
    )
    expect(supabase.rpc).toHaveBeenCalledWith('delete_empty_session', { p_session_id: 'empty-1' })
    expect(supabase.rpc).toHaveBeenCalledWith('delete_empty_session', { p_session_id: 'empty-2' })
    expect(within(card).getByText('2 of 4 booked')).toBeInTheDocument()
  })
})

describe('Hosting Next up', () => {
  it('shows the soonest booked date across listings, with a way into it', async () => {
    givenData({
      listings: [makeMyListing(), makeMyListing({ id: 'listing-2', title: 'Boxing' })],
      hostSessions: [
        makeHostSession({
          id: 'later',
          starts_at: hoursFromNow(40),
          bookings: [{ id: 'b-later', status: 'confirmed', guests_count: 1 }],
        }),
        makeHostSession({
          id: 'sooner',
          listing_id: 'listing-2',
          starts_at: hoursFromNow(10),
          listings: { title: 'Boxing' },
          bookings: [{ id: 'b-soon', status: 'confirmed', guests_count: 3 }],
        }),
      ],
    })
    await renderHosting()

    const next = sectionFor('Next up')
    expect(within(next).getByText('Boxing')).toBeInTheDocument()
    expect(within(next).getByText(/3 of 4 spots booked/)).toBeInTheDocument()
    expect(within(next).getByRole('link', { name: /View session/ })).toHaveAttribute(
      'href',
      '/hosting?session=sooner',
    )
  })

  it('names who is coming and quotes their note', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({
          id: 's-group',
          bookings: [{ id: 'b-group', status: 'confirmed', guests_count: 3, total_amount: 9000 }],
        }),
      ],
      bookings: [{ id: 'b-group', guest_id: 'g1', addon_note: 'Is there parking nearby?' }],
      sessionGuests: [
        { session_id: 's-group', booking_id: 'b-group', user_id: 'g1', display_name: 'Kai', is_companion: false, guests_count: 3 },
        { session_id: 's-group', booking_id: 'b-group', user_id: 'g2', display_name: 'Mei Ling', is_companion: true, guests_count: null },
      ],
    })
    await renderHosting()

    const next = sectionFor('Next up')
    expect(await within(next).findByText('Kai, Mei Ling + 1 more')).toBeInTheDocument()
    expect(within(next).getByText('“Is there parking nearby?”')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('host_session_guests', { p_session_ids: ['s-group'] })
  })
})

describe('Hosting session page', () => {
  function givenOneGuest(overrides = {}) {
    givenData({
      listings: [makeMyListing(overrides.listing)],
      hostSessions: [
        makeHostSession({
          bookings: [{ id: 'booking-1', status: 'confirmed', guests_count: 1, total_amount: 4500 }],
          ...overrides.session,
        }),
      ],
      bookings: [{ id: 'booking-1', guest_id: 'g1', addon_note: 'Is there parking nearby?' }],
      sessionGuests: [
        { session_id: 'session-1', booking_id: 'booking-1', user_id: 'g1', display_name: 'Wei Ling T.', is_companion: false, guests_count: 1 },
      ],
    })
    supabase.__on('booking_addons', 'select', {
      data: [{ id: 'a-1', booking_id: 'booking-1', name: 'Premium materials', quantity: 1, unit: 'person', unit_guest_cents: 1200 }],
      error: null,
    })
  }

  it('shows spots, each guest with add-ons and note, and why the time is fixed', async () => {
    givenOneGuest()
    await renderSessionPage('session-1')

    expect(screen.getByRole('link', { name: 'Back to Hosting' })).toHaveAttribute('href', '/hosting')
    expect(screen.getByText('Latte art')).toBeInTheDocument()
    expect(screen.getByText('1 of 4 spots booked')).toBeInTheDocument()
    expect(
      screen.getByText('3 spots still open. Bookings close 3 hours before, as set on this listing.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('1 spot · paid · Premium materials')).toBeInTheDocument()
    expect(screen.getByText('Wei Ling T.')).toBeInTheDocument()
    expect(screen.getByText('Note from Wei Ling T.')).toBeInTheDocument()
    expect(screen.getByText('Is there parking nearby?')).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'Add parking and directions to your listing' }),
    ).toHaveAttribute('href', '/edit-listing/listing-1?section=location')
    expect(screen.getByText('Notes are one-way. Answers in your listing reach every guest.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'This time is fixed now' })).toBeInTheDocument()
    expect(
      screen.getByText(
        "Once someone books, the date and time can't change. Wei Ling T. can move their own booking once, free, up to 48 hours before.",
      ),
    ).toBeInTheDocument()
    // Only what exists: no messaging, no time change, no pause.
    expect(screen.queryByRole('button', { name: /Message|Change time|Stop new bookings/ })).not.toBeInTheDocument()
  })

  it("uses the listing's own booking cutoff", async () => {
    givenOneGuest({ listing: { booking_cutoff_hours: 24 } })
    await renderSessionPage('session-1')

    expect(screen.getByText(/Bookings close 24 hours before, as set on this listing\./)).toBeInTheDocument()
  })

  it('offers to update directions when the listing already has them', async () => {
    givenOneGuest()
    givenRpc(async (name) =>
      name === 'listing_arrival_instructions'
        ? { data: 'Lift B to #04-56', error: null }
        : { data: null, error: null },
    )
    await renderSessionPage('session-1')

    expect(await screen.findByRole('link', { name: 'Update directions in your listing' })).toBeInTheDocument()
  })

  it('warns about the refund and strike, never an amount, before cancelling', async () => {
    givenOneGuest()
    const { user } = await renderSessionPage('session-1')

    expect(
      screen.getByText(
        /Wei Ling T\. gets a full refund, including the booking fee, and you get a strike\. You'll be asked to confirm\./,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cancellation policy' })).toHaveAttribute(
      'href',
      '/cancellation-policy',
    )
    await user.click(screen.getByRole('button', { name: 'Cancel this session' }))
    expect(
      screen.getByText('Cancelling refunds your guest in full and adds a strike to your account.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/\$45|\$90|total/i)).not.toBeInTheDocument()
  })

  it('cancels the whole session and goes back to Hosting', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    supabase.functions.invoke.mockResolvedValue({ data: { cancelled: 1 }, error: null })
    const { user, currentSearch } = await renderSessionPage('session-1')

    expect(screen.getByText(/Both guests get a full refund/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel this session' }))
    expect(
      screen.getByText('Cancelling refunds both guests in full and adds a strike to your account.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))

    await waitFor(() =>
      expect(supabase.functions.invoke).toHaveBeenCalledWith('cancel-booking', {
        body: { session_id: 'session-1' },
        headers: { Authorization: 'Bearer test-access-token' },
      }),
    )
    expect(await screen.findByText("Session cancelled. We're refunding both guests in full.")).toBeInTheDocument()
    expect(currentSearch()).not.toContain('session=')
  })

  it('shows an error from the cancel function and stays on the page', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    supabase.functions.invoke.mockResolvedValue({ data: { error: 'refund failed' }, error: null })
    const { user } = await renderSessionPage('session-1')

    await user.click(screen.getByRole('button', { name: 'Cancel this session' }))
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))

    expect(await screen.findByText('refund failed')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'This time is fixed now' })).toBeInTheDocument()
  })

  it('says so when the session is no longer on the schedule', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [] })
    await renderSessionPage('gone')

    expect(screen.getByText("This session isn't on your schedule any more.")).toBeInTheDocument()
  })
})

describe('Hosting setup checklist', () => {
  function step(title) {
    return within(sectionFor('Get ready for guests')).getByText(title).closest('li')
  }

  it('counts what is done and offers the next action on each open step', async () => {
    givenData({ listings: [makeMyListing()], payoutsEnabled: false })
    await renderHosting()

    const setup = sectionFor('Get ready for guests')
    expect(within(setup).getByText('2 of 4')).toBeInTheDocument()
    expect(within(setup).getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute(
      'aria-valuenow',
      '2'
    )
    expect(within(setup).getByText('Guests can only book once all four are done.')).toBeInTheDocument()
    expect(step('ID verified')).toHaveTextContent('Done. Guests see your verified badge.')
    expect(step('First listing created')).toHaveTextContent('Latte art')
    expect(within(step('Set up payouts')).getByRole('button', { name: 'Set up payouts' })).toBeInTheDocument()
    expect(
      within(step('Add your first session')).getByRole('button', { name: 'Add your first session' })
    ).toBeInTheDocument()
  })

  it('names the first listing the host created, which comes last in the newest-first list', async () => {
    givenData({
      listings: [
        makeMyListing({ id: 'listing-2', title: 'Boxing' }),
        makeMyListing({ id: 'listing-1', title: 'Latte art' }),
      ],
    })
    await renderHosting()

    expect(step('First listing created')).toHaveTextContent('Latte art')
  })

  it('asks a host whose ID is still being checked to wait rather than verify again', async () => {
    givenData({ listings: [makeMyListing()], verificationStatus: 'pending' })
    await renderHosting()

    expect(step('Verify your ID')).toHaveTextContent('We are checking your ID.')
    expect(within(step('Verify your ID')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('opens the session form on the first listing without dates from Add', async () => {
    givenData({
      listings: [
        makeMyListing({ id: 'listing-2', title: 'Boxing' }),
        makeMyListing({ id: 'listing-1', title: 'Latte art' }),
      ],
    })
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Add your first session' }))

    expect(screen.getByRole('dialog', { name: 'Add dates' })).toHaveTextContent('Boxing · No dates yet')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('goes away once all four steps are done', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [makeHostSession({ bookings: [] })],
    })
    await renderHosting()

    expect(screen.queryByRole('heading', { name: 'Get ready for guests' })).not.toBeInTheDocument()
  })
})

describe('Hosting this month', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-15T04:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads sessions from the start of the Singapore month', async () => {
    givenData({ listings: [makeMyListing()] })
    await renderHosting()

    expect(supabase.__lastCall('sessions', 'select').filters).toContainEqual({
      method: 'gte',
      column: 'starts_at',
      value: '2026-09-30T16:00:00.000Z',
    })
  })

  it('counts sessions, paid guests and what the host takes home this month', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        // Already past and nobody booked: it never ran and the page does not show it.
        makeHostSession({ id: 'past-empty', starts_at: '2026-10-05T02:00:00Z', bookings: [] }),
        makeHostSession({
          id: 'past',
          starts_at: '2026-10-10T02:00:00Z',
          bookings: [{ id: 'b1', status: 'confirmed', guests_count: 2, host_payout_amount: 4000 }],
        }),
        makeHostSession({
          id: 'soon',
          starts_at: '2026-10-20T02:00:00Z',
          bookings: [
            { id: 'b2', status: 'confirmed', guests_count: 1, total_amount: 2500, platform_fee: 300 },
            { id: 'b3', status: 'pending', guests_count: 3, total_amount: 7500, platform_fee: 900 },
          ],
        }),
        makeHostSession({ id: 'november', starts_at: '2026-11-03T02:00:00Z', bookings: [] }),
      ],
    })
    await renderHosting()

    const month = sectionFor('This month')
    const stat = (label) => within(month).getByText(label).closest('.hosting-stat')
    expect(stat('Sessions').querySelector('dd')).toHaveTextContent(/^2$/)
    expect(stat('Sessions').querySelector('.hosting-stat__note')).toHaveTextContent('1 held · 1 to come')
    expect(stat('Guests booked')).toHaveTextContent('3')
    expect(stat('Earned')).toHaveTextContent('S$62')
  })

  it('shows zeroes for a new host', async () => {
    givenData({ listings: [makeMyListing()] })
    await renderHosting()

    const month = sectionFor('This month')
    expect(within(month).getByText('Earned').closest('.hosting-stat')).toHaveTextContent('S$0')
    const sessions = within(month).getByText('Sessions').closest('.hosting-stat')
    expect(sessions.querySelector('dd')).toHaveTextContent(/^0$/)
    expect(sessions.querySelector('.hosting-stat__note')).toBeNull()
  })

  it('splits the Sessions total so it matches the dates listed below', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({ id: 'open-1', starts_at: '2026-10-20T02:00:00Z', bookings: [] }),
        makeHostSession({ id: 'open-2', starts_at: '2026-10-27T02:00:00Z', bookings: [] }),
      ],
    })
    await renderHosting()

    const sessions = within(sectionFor('This month')).getByText('Sessions').closest('.hosting-stat')
    expect(sessions.querySelector('dd')).toHaveTextContent(/^2$/)
    expect(sessions.querySelector('.hosting-stat__note')).toHaveTextContent(/^2 to come$/)
    expect(dateRows(listingCard('Latte art'))).toHaveLength(2)
  })
})

describe('Hosting listing cards', () => {
  it('shows a set-aside session as taken by the booked listing, not as an open date', async () => {
    const startsAt = hoursFromNow(30)
    givenData({
      listings: [makeMyListing(), makeMyListing({ id: 'listing-2', title: 'Pottery' })],
      hostSessions: [
        makeHostSession({
          id: 'booked-1',
          starts_at: startsAt,
          listing_id: 'listing-1',
          listings: { title: 'Latte art' },
          bookings: [{ id: 'b1', status: 'confirmed', guests_count: 1 }],
        }),
        makeHostSession({
          id: 'held-1',
          starts_at: startsAt,
          listing_id: 'listing-2',
          listings: { title: 'Pottery' },
          status: 'held',
          held_by_session_id: 'booked-1',
          bookings: [],
        }),
      ],
    })
    await renderHosting()

    const pottery = listingCard('Pottery')
    expect(
      within(pottery).getByText(
        "Taken: you're booked for Latte art then. Reopens if that booking is cancelled."
      )
    ).toBeInTheDocument()
    expect(within(pottery).getAllByText('No dates yet').length).toBeGreaterThan(0)
    expect(within(pottery).queryByText('1 open date')).not.toBeInTheDocument()
  })

  it('shows how many guests are keen on a listing with no dates', async () => {
    givenData({ listings: [makeMyListing()] })
    const previous = supabase.rpc.getMockImplementation()
    supabase.rpc.mockImplementation(async (name, args) =>
      name === 'host_listing_interest'
        ? {
            data: [
              { listing_id: 'listing-1', keen_count: 3, weekday: 0, weekend: 3, morning: 0, afternoon: 2, evening: 0 },
            ],
            error: null,
          }
        : previous(name, args)
    )
    await renderHosting()

    const card = listingCard('Latte art')
    expect(
      within(card).getByText(
        "3 people are keen. When suits them: Weekends 3, Afternoon 2. Add a date and we'll tell them."
      )
    ).toBeInTheDocument()
  })

  it('tells the host a new listing is in review while they add dates', async () => {
    givenData({ listings: [makeMyListing({ review_status: 'pending' })] })
    await renderHosting()

    const card = listingCard('Latte art')
    expect(within(card).getByText('In review')).toBeInTheDocument()
    expect(
      within(card).getByText(/taking a quick look before guests can see it/)
    ).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Add dates' })).toBeInTheDocument()
  })

  it("shows the reviewer's note and a way to fix it", async () => {
    givenData({
      listings: [
        makeMyListing({ review_status: 'changes_requested', review_note: 'Add a photo of the latte' }),
      ],
    })
    await renderHosting()

    const card = listingCard('Latte art')
    expect(within(card).getByText('Changes needed')).toBeInTheDocument()
    expect(within(card).getByText('Add a photo of the latte')).toBeInTheDocument()
    for (const link of within(card).getAllByRole('link', { name: 'Edit listing' })) {
      expect(link).toHaveAttribute('href', '/edit-listing/listing-1')
    }
    expect(card.querySelector('.hosting-review__link')).toHaveTextContent('Edit listing')
  })

  it('reads the review state with the listings', async () => {
    givenData({ listings: [makeMyListing()] })
    await renderHosting()

    const select = supabase.__calls('listings', 'select')[0].chain[0].args[0]
    expect(select).toMatch(/review_status/)
    expect(select).toMatch(/review_note/)
  })

  it('flags a listing with no dates and leads with Add dates', async () => {
    givenData({
      listings: [makeMyListing({ price_per_person: 2300, duration_mins: 90, max_guests: 4 })],
    })
    await renderHosting()

    const card = listingCard('Latte art')
    expect(within(card).getAllByText('No dates yet')).toHaveLength(2)
    expect(within(card).queryByText('Hidden: no sessions')).not.toBeInTheDocument()
    expect(within(card).getByText('S$23 · 90 min · up to 4')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Add dates' }).className).toContain(
      'primary'
    )
  })

  it('marks a listing with dates as live and counts them', async () => {
    const startsAt = hoursFromNow(30)
    givenData({
      listings: [makeMyListing()],
      hostSessions: [makeHostSession({ starts_at: startsAt, bookings: [] })],
    })
    await renderHosting()

    const card = listingCard('Latte art')
    expect(within(card).getByText('Live')).toBeInTheDocument()
    expect(within(card).getByText('1 open')).toBeInTheDocument()
    expect(within(card).getAllByText(sessionDayLabel(startsAt))).toHaveLength(1)
    expect(within(card).queryByText('No dates yet')).not.toBeInTheDocument()
  })

  it('counts a booked date beside the open ones, and leads Next up with it', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({ id: 'booked', starts_at: hoursFromNow(30) }),
        makeHostSession({ id: 'open', starts_at: hoursFromNow(60), bookings: [] }),
      ],
    })
    await renderHosting()

    expect(within(listingCard('Latte art')).getByText('1 with bookings · 1 open')).toBeInTheDocument()
    expect(within(sectionFor('Next up')).getByText('Latte art')).toBeInTheDocument()
  })

  it('says when every date is booked', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    await renderHosting()

    expect(within(listingCard('Latte art')).getByText('1 with bookings')).toBeInTheDocument()
  })
})

describe('Hosting draft listing', () => {
  const DRAFT_KEY = `trykai:listing-draft:${USER_ID}`

  function memoryStorage() {
    const items = new Map()
    return {
      getItem: (key) => (items.has(key) ? items.get(key) : null),
      setItem: (key, value) => items.set(key, String(value)),
      removeItem: (key) => items.delete(key),
    }
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a draft saved on this device with the step to pick up from', async () => {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: 2,
        title: 'Bake a focaccia together',
        price: '20',
        maxGuests: 4,
        durationChoice: 90,
      })
    )
    givenData({ listings: [makeMyListing()] })
    await renderHosting()

    const card = listingCard('Bake a focaccia together')
    expect(within(card).getByText('Draft')).toBeInTheDocument()
    expect(within(card).getByText('S$20 · 90 min · up to 4')).toBeInTheDocument()
    expect(within(card).getByText('Step 3 of 5: price and group size')).toBeInTheDocument()
    expect(
      within(card).getByRole('link', { name: 'Continue Bake a focaccia together' })
    ).toHaveAttribute('href', '/create-listing')
  })

  it('sends Continue to the wizard with the draft to restore', async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 1, title: 'Pottery' }))
    givenData({ listings: [makeMyListing()] })
    const { user, currentState } = renderWithRouter(
      <RequireAuth>
        <Hosting />
      </RequireAuth>,
      { route: '/hosting', path: '*', outlivesNavigation: true }
    )

    await user.click(await screen.findByRole('link', { name: 'Continue Pottery' }))

    expect(currentState()).toEqual({ resumeDraft: true })
  })

  it('throws the draft away from its menu', async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: 'Old idea' }))
    givenData({ listings: [makeMyListing()] })
    const { user } = await renderHosting()

    const card = listingCard('Old idea')
    await user.click(within(card).getByRole('button', { name: 'More actions' }))
    await user.click(within(card).getByRole('menuitem', { name: 'Discard draft' }))

    expect(screen.queryByText('Old idea')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
  })
})

describe('Hosting reviews due', () => {
  it('lists guests to review after the session', async () => {
    givenData({
      listings: [makeMyListing()],
      reviewsDue: [
        {
          booking_id: 'booking-1',
          guest_id: 'guest-1',
          guest_display_name: 'Sam',
          listing_title: 'Latte art',
          starts_at: hoursFromNow(-24),
          deadline: hoursFromNow(24 * 5),
          host_reviewed: false,
          guest_reviewed: true,
        },
      ],
    })
    await renderHosting()

    expect(screen.getByRole('heading', { name: '1 guest to review' })).toBeInTheDocument()
    expect(screen.getByText(/days? left$/)).toHaveTextContent(/^Reviewed you · \d+ days? left$/)
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
  })
})

describe('Hosting without photo tips', () => {
  it('leaves the photo tips to the listing forms', async () => {
    givenData({ listings: [makeMyListing()] })
    await renderHosting()

    expect(screen.queryByText('Better photos, more bookings')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /photo tips/ })).not.toBeInTheDocument()
  })
})

describe('Dashboard payout setup', () => {
  it('asks a host without payouts enabled to set them up', async () => {
    givenData({ listings: [makeMyListing()], payoutsEnabled: false })
    await renderHosting()

    const setup = sectionFor('Get ready for guests')
    expect(within(setup).getByText('Set up payouts')).toBeInTheDocument()
    expect(within(setup).getByText('No Stripe account needed. About 5 minutes: your phone, NRIC and bank details.')).toBeInTheDocument()
    expect(within(setup).getByRole('button', { name: 'Set up payouts' })).toHaveTextContent('Set up')
  })

  it('shows a waiting state while the Stripe account link is created', async () => {
    givenData({ listings: [makeMyListing()], payoutsEnabled: false })
    supabase.functions.invoke.mockImplementation(() => new Promise(() => {}))
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Set up payouts' }))

    expect(await screen.findByRole('heading', { name: 'Setting up payouts' })).toBeInTheDocument()
    expect(screen.getByText('Opening Stripe so you can add your bank details.')).toBeInTheDocument()
  })

  it('asks Stripe for an account link when payouts are not set up', async () => {
    givenData({ listings: [makeMyListing()], payoutsEnabled: false })
    supabase.functions.invoke.mockResolvedValue({
      data: { stripe_payouts_enabled: true, url: null },
      error: null,
    })
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Set up payouts' }))

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled())
    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-account-link', {
      body: {},
      headers: { Authorization: 'Bearer test-access-token' },
    })
    expect(await screen.findByText('Payouts are set up. Guests can now book you.')).toBeInTheDocument()
  })

  it('shows Stripe’s actual error when payout setup fails', async () => {
    givenData({ listings: [makeMyListing()], payoutsEnabled: false })
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
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Set up payouts' }))

    expect(
      await screen.findByText(
        'You cannot create Account Links until your platform branding is configured.'
      )
    ).toBeInTheDocument()
  })

  it('re-reads Stripe on ?connect=return and confirms when payouts are enabled', async () => {
    givenData({ listings: [makeMyListing()] })
    supabase.functions.invoke.mockResolvedValue({
      data: { stripe_payouts_enabled: true, url: null },
      error: null,
    })
    renderWithRouter(
      <RequireAuth>
        <Hosting />
      </RequireAuth>,
      { route: '/hosting?connect=return', path: '/hosting' }
    )

    expect(
      await screen.findByText('Payouts are set up. Guests can now book you.')
    ).toBeInTheDocument()
    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-account-link', {
      body: { refresh: true },
      headers: { Authorization: 'Bearer test-access-token' },
    })
    expect(screen.queryByText(/Payout setup submitted/)).not.toBeInTheDocument()
    expect(notifiedListingIds()).toEqual([])
  })

  it('does not scroll to the top when the connect param is cleared', async () => {
    givenData({ listings: [makeMyListing()] })
    supabase.functions.invoke.mockResolvedValue({
      data: { stripe_payouts_enabled: true, url: null },
      error: null,
    })
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    try {
      const { currentSearch } = renderWithDataRouter(
        <RequireAuth>
          <Hosting />
        </RequireAuth>,
        { route: '/hosting?connect=return', path: '/hosting', withScrollRestoration: true },
      )
      await screen.findByRole('heading', { name: 'Hosting', level: 1 })
      scrollTo.mockClear()
      expect(
        await screen.findByText('Payouts are set up. Guests can now book you.'),
      ).toBeInTheDocument()
      await waitFor(() => expect(currentSearch()).toBe(''))
      expect(scrollTo).not.toHaveBeenCalledWith(0, 0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('emails waiting guests once payouts are on, dates are up, and guests are waiting', async () => {
    givenData({
      listings: [makeMyListing(), makeMyListing({ id: 'listing-2', title: 'Pottery' })],
      hostSessions: [
        makeHostSession({ listing_id: 'listing-1', status: 'open' }),
        makeHostSession({ id: 'session-2', listing_id: 'listing-2', status: 'open' }),
      ],
      interest: [waitingInterest('listing-1'), waitingInterest('listing-2', 4)],
    })
    await renderHosting()

    await waitFor(() => expect(notifiedListingIds()).toEqual(['listing-1', 'listing-2']))
  })

  it('does not email when nobody is still waiting', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [makeHostSession({ listing_id: 'listing-1', status: 'open' })],
    })
    await renderHosting()

    expect(notifiedListingIds()).toEqual([])
  })

  it('does not email while payouts are off', async () => {
    givenData({
      listings: [makeMyListing()],
      payoutsEnabled: false,
      hostSessions: [makeHostSession({ listing_id: 'listing-1', status: 'open' })],
      interest: [waitingInterest('listing-1')],
    })
    await renderHosting()

    expect(notifiedListingIds()).toEqual([])
  })

  it('emails when payouts were already on at load, the webhook-first case', async () => {
    givenData({
      listings: [makeMyListing()],
      payoutsEnabled: true,
      hostSessions: [makeHostSession({ listing_id: 'listing-1', status: 'open' })],
      interest: [waitingInterest('listing-1')],
    })
    await renderHosting()

    await waitFor(() => expect(notifiedListingIds()).toEqual(['listing-1']))
  })

  it('does not email the same listing twice on this mount', async () => {
    givenData({
      listings: [makeMyListing()],
      payoutsEnabled: true,
      hostSessions: [makeHostSession({ listing_id: 'listing-1', status: 'open' })],
      interest: [waitingInterest('listing-1')],
    })
    supabase.functions.invoke.mockResolvedValue({
      data: { stripe_payouts_enabled: true, url: null },
      error: null,
    })
    renderWithRouter(
      <RequireAuth>
        <Hosting />
      </RequireAuth>,
      { route: '/hosting?connect=return', path: '/hosting' },
    )

    expect(await screen.findByText('Payouts are set up. Guests can now book you.')).toBeInTheDocument()
    await waitFor(() => expect(notifiedListingIds()).toEqual(['listing-1']))
  })

  it('emails waiting guests once the Connect return enables payouts, and ignores a notify failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    givenData({
      listings: [makeMyListing(), makeMyListing({ id: 'listing-2', title: 'Pottery' })],
      payoutsEnabled: false,
      hostSessions: [
        makeHostSession({ listing_id: 'listing-1', status: 'open' }),
        makeHostSession({ id: 'session-2', listing_id: 'listing-2', status: 'open' }),
      ],
      interest: [waitingInterest('listing-1'), waitingInterest('listing-2')],
    })
    supabase.functions.invoke.mockImplementation(async (name) => {
      if (name === 'create-account-link') {
        return { data: { stripe_payouts_enabled: true, url: null }, error: null }
      }
      if (name === 'notify-interested') {
        return { data: null, error: { message: 'notify down' } }
      }
      return { data: null, error: null }
    })
    renderWithRouter(
      <RequireAuth>
        <Hosting />
      </RequireAuth>,
      { route: '/hosting?connect=return', path: '/hosting' },
    )

    expect(await screen.findByText('Payouts are set up. Guests can now book you.')).toBeInTheDocument()
    expect(notifiedListingIds()).toEqual(['listing-1', 'listing-2'])
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('re-reads Stripe on ?connect=return and offers to continue when payouts are not enabled', async () => {
    givenData({ listings: [makeMyListing()] })
    supabase.functions.invoke.mockResolvedValue({
      data: { stripe_payouts_enabled: false, url: null },
      error: null,
    })
    const assign = vi.fn()
    vi.stubGlobal('location', { assign, origin: 'http://localhost:3000', href: 'http://localhost:3000/hosting' })

    try {
      const { user } = renderWithRouter(
        <RequireAuth>
          <Hosting />
        </RequireAuth>,
        { route: '/hosting?connect=return', path: '/hosting' }
      )

      expect(await screen.findByText("Your payout setup isn't finished yet.")).toBeInTheDocument()
      expect(screen.queryByText(/Payout setup submitted/)).not.toBeInTheDocument()

      supabase.functions.invoke.mockResolvedValue({
        data: { stripe_payouts_enabled: false, url: 'https://connect.stripe.com/setup/fresh' },
        error: null,
      })
      await user.click(screen.getByRole('button', { name: 'Continue payout setup' }))

      await waitFor(() =>
        expect(supabase.functions.invoke).toHaveBeenCalledWith('create-account-link', {
          body: {},
          headers: { Authorization: 'Bearer test-access-token' },
        })
      )
      expect(assign).toHaveBeenCalledWith('https://connect.stripe.com/setup/fresh')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  function renderPayoutReturn() {
    return renderWithRouter(
      <RequireAuth>
        <Hosting />
      </RequireAuth>,
      { route: '/hosting?connect=return', path: '/hosting' }
    )
  }

  it('polls while Stripe is only verifying and confirms when payouts enable on the next check', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    givenData({ listings: [makeMyListing()], payoutsEnabled: false })
    supabase.functions.invoke
      .mockResolvedValueOnce({
        data: { stripe_payouts_enabled: false, pending: true, url: null },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { stripe_payouts_enabled: true, pending: false, url: null },
        error: null,
      })

    try {
      renderPayoutReturn()

      expect(await screen.findByText(PAYOUT_CHECKING_COPY)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Set up payouts|Continue payout setup/ })).toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PAYOUT_PENDING_POLL_MS)
      })

      expect(await screen.findByText(PAYOUT_READY_COPY)).toBeInTheDocument()
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops asking after 60 seconds and says Stripe is still checking', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    givenData({ listings: [makeMyListing()], payoutsEnabled: false })
    supabase.functions.invoke.mockResolvedValue({
      data: { stripe_payouts_enabled: false, pending: true, url: null },
      error: null,
    })

    try {
      renderPayoutReturn()

      expect(await screen.findByText(PAYOUT_CHECKING_COPY)).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PAYOUT_PENDING_WAIT_MS)
      })

      expect(await screen.findByText(PAYOUT_STILL_CHECKING_COPY)).toBeInTheDocument()
      expect(screen.getByText(/Check back in a few minutes/)).toBeInTheDocument()
      expect(screen.queryByText(/We'll update this page/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Set up payouts|Continue payout setup/ })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows Set up when Stripe still needs something from the host', async () => {
    givenData({ listings: [makeMyListing()], payoutsEnabled: false })
    supabase.functions.invoke.mockResolvedValue({
      data: { stripe_payouts_enabled: false, pending: false, url: null },
      error: null,
    })
    renderPayoutReturn()

    expect(await screen.findByText("Your payout setup isn't finished yet.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue payout setup' })).toHaveTextContent('Continue')
    expect(screen.queryByText(PAYOUT_CHECKING_COPY)).not.toBeInTheDocument()
  })

  it('stops polling for a pending payout check when the page closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    givenData({ listings: [makeMyListing()], payoutsEnabled: false })
    supabase.functions.invoke.mockResolvedValue({
      data: { stripe_payouts_enabled: false, pending: true, url: null },
      error: null,
    })

    try {
      const { unmount } = renderPayoutReturn()
      expect(await screen.findByText(PAYOUT_CHECKING_COPY)).toBeInTheDocument()
      const calls = supabase.functions.invoke.mock.calls.length
      unmount()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PAYOUT_PENDING_WAIT_MS)
      })
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(calls)
    } finally {
      vi.useRealTimers()
    }
  })

  it('re-reads Stripe on ?connect=refresh instead of assuming setup is done', async () => {
    givenData({ listings: [makeMyListing()] })
    supabase.functions.invoke.mockResolvedValue({
      data: { stripe_payouts_enabled: false, url: null },
      error: null,
    })
    renderWithRouter(
      <RequireAuth>
        <Hosting />
      </RequireAuth>,
      { route: '/hosting?connect=refresh', path: '/hosting' }
    )

    expect(await screen.findByText("Your payout setup isn't finished yet.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue payout setup' })).toHaveTextContent('Continue')
    expect(screen.queryByText(/Payout setup submitted/)).not.toBeInTheDocument()
  })
})

describe('Dashboard reviews', () => {
  const pastBooking = () =>
    makeBooking({
      id: 'booking-past',
      sessions: {
        starts_at: hoursFromNow(-5),
        duration_mins: 90,
        listings: { title: 'Latte art', host_id: HOST_ID },
      },
    })

  it('invites a review after the session has happened', async () => {
    givenData({ bookings: [pastBooking()] })
    await renderBookings()

    expect(screen.getByRole('link', { name: 'Leave a review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('does not invite a review before the session ends', async () => {
    givenData({
      bookings: [
        makeBooking({
          sessions: {
            starts_at: hoursFromNow(-1),
            duration_mins: 120,
            listings: { title: 'Latte art', host_id: HOST_ID },
          },
        }),
      ],
    })
    await renderBookings()

    expect(screen.queryByRole('link', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('does not invite a review before the session', async () => {
    givenData({ bookings: [makeBooking()] })
    await renderBookings()

    expect(screen.queryByRole('link', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('uses starts_at plus two hours when the session has no duration', async () => {
    givenData({
      bookings: [
        makeBooking({
          id: 'booking-past',
          sessions: {
            starts_at: hoursFromNow(-1),
            listings: { title: 'Latte art', host_id: HOST_ID },
          },
        }),
      ],
    })
    await renderBookings()

    expect(screen.queryByRole('link', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('invites a review two hours after start when duration is missing', async () => {
    givenData({
      bookings: [
        makeBooking({
          id: 'booking-past',
          sessions: {
            starts_at: hoursFromNow(-3),
            listings: { title: 'Latte art', host_id: HOST_ID },
          },
        }),
      ],
    })
    await renderBookings()

    expect(screen.getByRole('link', { name: 'Leave a review' })).toBeInTheDocument()
  })

  it('does not invite a review after the 7-day window', async () => {
    givenData({
      bookings: [
        makeBooking({
          id: 'booking-old',
          sessions: {
            starts_at: hoursFromNow(-8 * 24),
            duration_mins: 90,
            listings: { title: 'Latte art', host_id: HOST_ID },
          },
        }),
      ],
    })
    await renderBookings()

    expect(screen.queryByRole('link', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('does not invite a review on a pending booking', async () => {
    givenData({ bookings: [makeBooking({ ...pastBooking(), status: 'pending' })] })
    await renderBookings()

    expect(screen.queryByRole('link', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('centres the status badge and review action on one line', async () => {
    givenData({ bookings: [pastBooking()] })
    await renderBookings()

    const reviewButton = screen.getByRole('link', { name: 'Leave a review' })
    expect(reviewButton).toHaveClass('ui-button', 'ui-button--secondary', 'btn--small')
    expect(reviewButton.parentElement).toHaveClass('booking-card__actions')
    expect(reviewButton.parentElement.querySelector('.badge')).toHaveTextContent('confirmed')
  })

  it('centres Review submitted with the status badge', async () => {
    givenData({ bookings: [pastBooking()], reviews: [{ booking_id: 'booking-past' }] })
    await renderBookings()

    const submitted = screen.getByText('Review submitted')
    expect(submitted.parentElement).toHaveClass('booking-card__actions')
    expect(submitted.parentElement.querySelector('.badge')).toHaveTextContent('confirmed')
  })

  it('does not invite a second review for the same booking', async () => {
    givenData({ bookings: [pastBooking()], reviews: [{ booking_id: 'booking-past' }] })
    await renderBookings()

    expect(screen.queryByRole('link', { name: 'Leave a review' })).not.toBeInTheDocument()
    expect(screen.getByText('Review submitted')).toBeInTheDocument()
  })

  it('does not invite a review on a cancelled booking', async () => {
    givenData({
      bookings: [
        makeBooking({ ...pastBooking(), status: 'cancelled', stripe_charge_id: 'ch_1' }),
      ],
    })
    await renderBookings()

    expect(screen.queryByRole('link', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('sends the guest to the review on the booking page', async () => {
    givenData({ bookings: [pastBooking()] })
    await renderBookings()

    const link = screen.getByRole('link', { name: 'Leave a review' })
    expect(link).toHaveAttribute('href', '/bookings/booking-past#review')
    expect(screen.queryByRole('button', { name: 'Post review' })).not.toBeInTheDocument()
  })
})

describe('Dashboard post-payment status', () => {
  function renderReturningFromPayment() {
    return renderWithRouter(
      <RequireAuth>
        <Bookings />
      </RequireAuth>,
      { route: '/bookings?booking=booking-1', path: '/bookings' }
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

  it('does not scroll to the top when payment query params are cleared', async () => {
    supabase.__on('bookings', 'select', (call) =>
      call.single ? { data: { status: 'confirmed' }, error: null } : { data: [], error: null }
    )
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    try {
      const { currentSearch } = renderWithDataRouter(
        <RequireAuth>
          <Bookings />
        </RequireAuth>,
        {
          route: '/bookings?booking=booking-1',
          path: '/bookings',
          withScrollRestoration: true,
        },
      )
      await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
      scrollTo.mockClear()
      await screen.findByText('Booking confirmed! Your payment was successful.')
      await waitFor(() => expect(currentSearch()).toBe(''))
      expect(scrollTo).not.toHaveBeenCalledWith(0, 0)
    } finally {
      vi.unstubAllGlobals()
    }
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

  it('does not say payment was received when the guest cancelled checkout', async () => {
    givenData({ bookings: [makeBooking({ status: 'pending' })] })
    supabase.__on('bookings', 'select', (call) =>
      call.single
        ? { data: { status: 'pending' }, error: null }
        : { data: [makeBooking({ status: 'pending' })], error: null }
    )
    renderWithRouter(
      <RequireAuth>
        <Bookings />
      </RequireAuth>,
      {
        route: '/bookings?booking=booking-1&redirect_status=failed',
        path: '/bookings',
      }
    )

    const notice = await screen.findByText(
      'This booking was not completed. You can try booking again.'
    )
    expect(notice).toHaveClass('status-banner--error')
    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument()
    expect(screen.queryByText('Learn latte art with me')).not.toBeInTheDocument()
    expect(screen.queryByText('pending')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('keeps waiting when Stripe accepted the payment and the booking is still pending', async () => {
    supabase.__on('bookings', 'select', (call) =>
      call.single ? { data: { status: 'pending' }, error: null } : { data: [], error: null }
    )
    renderWithRouter(
      <RequireAuth>
        <Bookings />
      </RequireAuth>,
      { route: '/bookings?booking=booking-1&payment=succeeded', path: '/bookings' }
    )

    expect(await screen.findByText('Processing your booking…')).toBeInTheDocument()
    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument()
    expect(screen.queryByText(/not completed/)).not.toBeInTheDocument()
  })

  it('drops an unpaid booking once checkout is cancelled', async () => {
    supabase.__on('bookings', 'select', (call) =>
      call.single
        ? { data: { status: 'cancelled' }, error: null }
        : { data: [makeBooking({ status: 'pending' })], error: null }
    )
    renderReturningFromPayment()

    expect(
      await screen.findByText('This booking was not completed. You can try booking again.')
    ).toBeInTheDocument()
    expect(screen.getByText('No bookings yet.')).toBeInTheDocument()
    expect(screen.queryByText('pending')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('does not list an abandoned checkout that is still pending', async () => {
    givenData({
      bookings: [
        makeBooking({
          status: 'pending',
          sessions: {
            starts_at: hoursFromNow(48),
            duration_mins: 90,
            listings: { title: 'test review bug', host_id: HOST_ID },
          },
        }),
      ],
    })
    await renderBookings()

    expect(screen.getByText('No bookings yet.')).toBeInTheDocument()
    expect(screen.queryByText('test review bug')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })
})

describe('Dashboard · who is coming', () => {
  it("lists a friend's seat as booked by someone else, with no actions", async () => {
    givenData({
      companionBookings: [
        {
          id: 'booking-friend',
          status: 'confirmed',
          session_id: 's-friend',
          guests_count: 3,
          is_companion: true,
          booker_display_name: 'Kai',
          sessions: {
            starts_at: hoursFromNow(48),
            duration_mins: 90,
            listings: { id: 'listing-9', title: 'Flower arranging', host_id: HOST_ID, duration_mins: 90 },
          },
        },
      ],
    })
    await renderBookings()

    expect(await screen.findByText(/Booked by Kai/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Flower arranging' })).toHaveAttribute('href', '/bookings/booking-friend')
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Leave a review' })).not.toBeInTheDocument()
  })
})
