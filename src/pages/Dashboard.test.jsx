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
import { formatDayLabel } from '../lib/sessionCalendar'
import { addSingaporeDays, singaporeDateKey } from '../lib/sessionBatch'
import { formatSessionDateTime } from '../lib/sessionDate'
import { renderWithRouter } from '../test/render'
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
  await user.click(within(card).getByRole('button', { name: 'More actions' }))
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
  it('lists the host listings with a thumbnail, add-session, and edit on the row', async () => {
    givenData({ listings: [makeMyListing({ id: 'listing-9', title: 'Boxing' })] })
    await renderHosting()

    const card = listingCard('Boxing')
    expect(within(card).getByRole('link', { name: /Boxing/ })).toHaveAttribute(
      'href',
      '/edit-listing/listing-9'
    )
    expect(card.querySelector('.hosting-listing__thumb')).toHaveAttribute(
      'src',
      'https://cdn.test/latte.jpg'
    )
    expect(within(card).getByRole('button', { name: 'Add sessions' }).className).toContain(
      'hosting-listing__add'
    )
    expect(screen.getByRole('link', { name: 'New listing' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(card.querySelector('.hosting-listing__text')).toBeInTheDocument()
    expect(card.querySelector('.hosting-listing__menu')).toBeInTheDocument()
    expect(card.className).toContain('hosting-listing-card')
  })

  it('keeps thumbnail and title on one line, the menu in the card corner, and one listing per row', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    const listing = css.match(/\.hosting-listing \{[\s\S]*?\n\}/)
    const main = css.match(/\.hosting-listing__main \{[\s\S]*?\n\}/)
    const text = css.match(/\.hosting-listing__text \{[\s\S]*?\n\}/)
    const menu = css.match(/\.ui-overflow\.hosting-listing__menu \{[\s\S]*?\n\}/)
    const foot = css.match(/\.hosting-listing__foot \{[\s\S]*?\n\}/)
    const listings = css.match(/\.dashboard-list--listings \{[\s\S]*?\n\}/)
    expect(listing?.[0]).toMatch(/flex-direction:\s*column/)
    expect(main?.[0]).toMatch(/display:\s*flex/)
    expect(main?.[0]).not.toMatch(/flex-direction:\s*column/)
    expect(main?.[0]).toMatch(/padding-right:\s*44px/)
    expect(text?.[0]).toMatch(/min-width:\s*0/)
    expect(menu?.[0]).toMatch(/position:\s*absolute/)
    expect(menu?.[0]).toMatch(/top:\s*8px/)
    expect(menu?.[0]).toMatch(/right:\s*8px/)
    expect(foot?.[0]).toMatch(/justify-content:\s*space-between/)
    expect(listings?.[0]).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(listings?.[0]).toMatch(/align-items:\s*start/)
    expect(css).toMatch(/\.add-sessions__repeat select\.input \{[^}]*padding-right:\s*42px/)
    expect(css).not.toMatch(
      /@media \(min-width: 1024px\) \{\s*\.dashboard-list--listings \{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    )
    expect(css).not.toMatch(
      /@media \(min-width: 768px\) \{\s*\.hosting-listing \{\s*flex-direction:\s*row;/
    )
    expect(css).not.toMatch(
      /@media \(min-width: 768px\) \{\s*\.dashboard-list--listings \{\s*grid-template-columns:\s*repeat\(2/
    )
    expect(css).toMatch(/\.hosting-sessions__more \{[^}]*padding:\s*10px 14px/)
    expect(css).toMatch(
      /\.dashboard-card\.hosting-listing-card:has\(\.ui-overflow__menu\) \{[^}]*z-index:\s*30;/
    )
    expect(css).toMatch(/\.ui-overflow__menu \{[^}]*opacity:\s*1;/)
    expect(css).toMatch(/\.ui-overflow__item \{[^}]*background-color:\s*var\(--bg-elevated\);/)
  })

  it('hides edit, view, and delete behind the overflow menu', async () => {
    givenData({ listings: [makeMyListing({ id: 'listing-9', title: 'Boxing' })] })
    const { user } = await renderHosting()

    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument()
    await openListingMenu(user, 'Boxing')

    expect(screen.getByRole('menuitem', { name: 'View listing' })).toHaveAttribute(
      'href',
      '/listings/listing-9'
    )
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/edit-listing/listing-9'
    )
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
    await user.click(screen.getByRole('button', { name: 'Add sessions' }))
  }

  async function fillSession(user, { daysAhead = 1, time = '10:30' } = {}) {
    const dateKey = dateKeyFromToday(daysAhead)
    await selectCalendarDate(user, dateKey)
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: time } })
    return dateKey
  }

  async function reviewAndCreate(user) {
    await user.click(screen.getByRole('button', { name: 'Review sessions' }))
    await user.click(screen.getByRole('button', { name: 'Create sessions' }))
  }

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
    expect(screen.getByLabelText('Duration (mins)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Duration (mins)'), { target: { value: '60' } })
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

  it('shows the listing duration and does not ask for one', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)

    expect(screen.getByText('Each session is 1 hr 30 min.')).toBeInTheDocument()
    expect(screen.getByText(/4 spots per session/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'change in listing settings' })).toHaveAttribute(
      'href',
      '/edit-listing/listing-1'
    )
    expect(screen.queryByLabelText('Duration (mins)')).not.toBeInTheDocument()
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

  it('offers the same times on another listing, with that listing\'s spots', async () => {
    givenData({
      listings: [makeMyListing(), makeMyListing({ id: 'listing-2', title: 'Pottery', max_guests: 6 })],
    })
    const { user } = await renderHosting()
    await user.click(within(listingCard('Latte art')).getByRole('button', { name: 'Add sessions' }))
    const dateKey = await fillSession(user, { time: '10:30' })
    await user.click(screen.getByRole('checkbox', { name: 'Pottery' }))
    await user.click(screen.getByRole('button', { name: 'Review sessions' }))
    expect(screen.getByText(/on each of 2 listings/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create sessions' }))

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
    await user.click(within(listingCard('Latte art')).getByRole('button', { name: 'Add sessions' }))
    await fillSession(user)
    await user.click(screen.getByRole('checkbox', { name: 'Pottery' }))
    await reviewAndCreate(user)

    expect(await screen.findByText(/None added on Pottery/)).toBeInTheDocument()
  })

  it('does not offer other listings when the host has only one', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    expect(screen.queryByText('Also offer these times on')).not.toBeInTheDocument()
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

  it('previews a clash with an existing session instead of merging spots', async () => {
    const dateKey = dateKeyFromToday(1)
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({
          starts_at: `${dateKey}T02:30:00.000Z`,
          duration_mins: 90,
          bookings: [],
        }),
      ],
    })
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user, { time: '10:30' })

    await user.click(screen.getByRole('button', { name: 'Review sessions' }))

    expect(screen.getByText('This creates 0 sessions. 1 will be skipped.')).toBeInTheDocument()
    expect(screen.getByText(/clashes with an existing session/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create sessions' })).toBeDisabled()
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'add_listing_session')).toBe(false)
  })

  it('rejects a session with no date or time', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    fireEvent.submit(document.querySelector('.dashboard-card__form'))

    expect(await screen.findByText('Please enter a date and time.')).toBeInTheDocument()
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'add_listing_session')).toBe(false)
  })

  it('does not let the host pick today or a date 81 days out', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)

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
    fireEvent.submit(document.querySelector('.dashboard-card__form'))

    expect(
      await screen.findByText('Set spots per session in listing settings first.')
    ).toBeInTheDocument()
  })

  it('closes the form after a successful save', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    await fillSession(user)

    await reviewAndCreate(user)

    await waitFor(() => expect(screen.queryByLabelText('Time')).not.toBeInTheDocument())
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
    await user.click(screen.getByRole('button', { name: '+ add time' }))
    fireEvent.change(screen.getByLabelText('Time 2'), { target: { value: '10:30' } })

    await user.click(screen.getByRole('button', { name: 'Review sessions' }))

    expect(screen.getByText('This creates 1 session. 1 will be skipped.')).toBeInTheDocument()
    expect(screen.getByText(/clashes with another session in this batch/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create sessions' }))

    await waitFor(() =>
      expect(
        supabase.rpc.mock.calls.filter(([name]) => name === 'add_listing_session')
      ).toHaveLength(1)
    )
    expect(await screen.findByText(/Created 1 session\. Skipped 1:/)).toBeInTheDocument()
  })

  it('quick-fills Sat and Sun for two weeks at two times', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)

    await user.click(screen.getByRole('button', { name: 'Sat' }))
    await user.click(screen.getByRole('button', { name: 'Sun' }))
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } })
    await user.click(screen.getByRole('button', { name: '+ add time' }))
    fireEvent.change(screen.getByLabelText('Time 2'), { target: { value: '14:00' } })

    await user.click(screen.getByRole('button', { name: 'Review sessions' }))

    expect(screen.getByText('This creates 8 sessions.')).toBeInTheDocument()
    expect(within(listingCard('Latte art')).getByRole('list').querySelectorAll('li')).toHaveLength(8)
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
    [72, 'Full refund of $45, including the platform fee'],
    [30, 'Partial refund of $19.13 — 50% of the lesson fee'],
    [12, 'Partial refund of $9.56 — 25% of the lesson fee'],
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

describe('Dashboard host cancellation', () => {
  it('lists a fully booked upcoming session so the host can still cancel it', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({
          id: 's-full',
          bookings: [{ id: 'b-full', status: 'confirmed', guests_count: 4, total_amount: 18000 }],
        }),
      ],
    })
    await renderHosting()

    expect(within(sectionFor('Upcoming bookings')).getByText('Latte art')).toBeInTheDocument()
    expect(within(sectionFor('Upcoming bookings')).getByText(/4 guests booked/)).toBeInTheDocument()
    expect(within(sectionFor('Upcoming bookings')).getByRole('button', { name: 'Cancel session' })).toBeInTheDocument()
    expect(within(listingCard('Latte art')).queryByRole('button', { name: 'Cancel session' })).not.toBeInTheDocument()
  })

  it('lists upcoming sessions even when they have no active bookings', async () => {
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
    await renderHosting()

    expect(within(sectionFor('Upcoming bookings')).getByRole('button', { name: 'Cancel session' })).toBeInTheDocument()
    expect(within(listingCard('Latte art')).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(listingCard('Latte art')).queryByRole('button', { name: 'Cancel session' })).not.toBeInTheDocument()
  })

  it('does not treat an unpaid checkout as an active hosted booking', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({
          bookings: [{ id: 'b-pending', status: 'pending', guests_count: 1, total_amount: 4500 }],
        }),
      ],
    })
    await renderHosting()

    expect(screen.queryByRole('heading', { name: 'Upcoming bookings' })).not.toBeInTheDocument()
    expect(screen.queryByText(/active booking/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel session' })).not.toBeInTheDocument()
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

  it('lets the owner delete an empty session', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [makeHostSession({ bookings: [] })],
    })
    givenRpc(async (name) => {
      if (name === 'delete_empty_session') return { data: 'session-1', error: null }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() =>
      expect(within(listingCard('Latte art')).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    )
    expect(supabase.rpc).toHaveBeenCalledWith('delete_empty_session', {
      p_session_id: 'session-1',
    })
  })

  it('does not let a non-owner delete a session', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [makeHostSession({ bookings: [] })],
    })
    givenRpc(async (name) => {
      if (name === 'delete_empty_session') {
        return { data: null, error: { message: 'not allowed' } }
      }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect(await screen.findByText('not allowed')).toBeInTheDocument()
    expect(within(listingCard('Latte art')).getByRole('button', { name: 'Confirm delete' })).toBeInTheDocument()
    expect(within(listingCard('Latte art')).queryByText(/active booking/)).not.toBeInTheDocument()
  })

  it('does not offer Delete on a session with a confirmed booking', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    await renderHosting()

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(sectionFor('Upcoming bookings')).getByRole('button', { name: 'Cancel session' })).toBeInTheDocument()
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'delete_empty_session')).toBe(false)
  })

  it('moves an empty session through edit_open_session', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [makeHostSession({ bookings: [] })],
    })
    givenRpc(async (name) => {
      if (name === 'edit_open_session') return { data: 'session-1', error: null }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dateKey = dateKeyFromToday(2)
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: dateKey } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '15:00' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('edit_open_session', {
        p_session_id: 'session-1',
        p_starts_at: `${dateKey}T07:00:00.000Z`,
      })
    )
  })

  it('keeps the session and explains when a booking wins the race', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [makeHostSession({ bookings: [] })],
    })
    givenRpc(async (name) => {
      if (name === 'edit_open_session') {
        return { data: null, error: { message: 'session_has_bookings' } }
      }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText("Someone just started booking this session, so it can't be edited.")
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('names a single guest in the cancel warning without an amount', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({
          bookings: [{ id: 'booking-1', status: 'confirmed', guests_count: 1 }],
        }),
      ],
    })
    const { user } = await renderHosting()

    expect(screen.getByText(/1 guest/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel session' }))
    expect(
      screen.getByText('Cancelling refunds your guest in full and adds a strike to your account.')
    ).toBeInTheDocument()
  })

  it('warns about the strike before cancelling', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Cancel session' }))

    expect(
      screen.getByText('Cancelling refunds both guests in full and adds a strike to your account.')
    ).toBeInTheDocument()
    const warning = within(sectionFor('Upcoming bookings'))
    expect(warning.queryByText(/Full refund of/)).not.toBeInTheDocument()
    expect(warning.queryByText(/\$90|\$45|total/i)).not.toBeInTheDocument()
  })

  it('asks the cancel-booking function to cancel the whole session', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    supabase.functions.invoke.mockResolvedValue({ data: { cancelled: 1 }, error: null })
    const { user } = await renderHosting()

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
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Cancel session' }))
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))

    expect(await screen.findByText('refund failed')).toBeInTheDocument()
  })

  it('shows booked sessions first and hides empty ones behind Show all', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({
          id: 'empty-1',
          starts_at: hoursFromNow(10),
          bookings: [],
        }),
        makeHostSession({
          id: 'empty-2',
          starts_at: hoursFromNow(20),
          bookings: [],
        }),
        makeHostSession({
          id: 'empty-3',
          starts_at: hoursFromNow(30),
          bookings: [],
        }),
        makeHostSession({
          id: 'empty-4',
          starts_at: hoursFromNow(40),
          bookings: [],
        }),
        makeHostSession({
          id: 'booked',
          starts_at: hoursFromNow(50),
          bookings: [{ id: 'b-1', status: 'confirmed', guests_count: 1 }],
        }),
      ],
    })
    const { user } = await renderHosting()
    const card = listingCard('Latte art')

    expect(within(sectionFor('Upcoming bookings')).getByRole('button', { name: 'Cancel session' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Cancel session' })).not.toBeInTheDocument()
    expect(within(card).getAllByRole('button', { name: 'Delete' })).toHaveLength(3)
    expect(within(card).getByRole('button', { name: 'Show all 4 open sessions' })).toBeInTheDocument()
    expect(within(card).queryByLabelText(`Select ${formatSessionDateTime(hoursFromNow(50))}`)).not.toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Show all 4 open sessions' }))

    expect(within(card).getAllByRole('button', { name: 'Delete' })).toHaveLength(4)
    expect(within(card).queryByRole('button', { name: 'Show all 4 open sessions' })).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Show fewer' })).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Show fewer' }))

    expect(within(card).getAllByRole('button', { name: 'Delete' })).toHaveLength(3)
    expect(within(card).getByRole('button', { name: 'Show all 4 open sessions' })).toBeInTheDocument()
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

  it('deletes only the empty sessions that were ticked', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({ id: 'empty-1', starts_at: hoursFromNow(10), bookings: [] }),
        makeHostSession({ id: 'empty-2', starts_at: hoursFromNow(20), bookings: [] }),
        makeHostSession({
          id: 'booked',
          starts_at: hoursFromNow(30),
          bookings: [{ id: 'b-1', status: 'confirmed', guests_count: 2 }],
        }),
      ],
    })
    givenRpc(async (name) => {
      if (name === 'delete_empty_session') return { data: true, error: null }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()
    const card = listingCard('Latte art')

    await user.click(
      within(card).getByLabelText(`Select ${formatSessionDateTime(hoursFromNow(10))}`)
    )
    await user.click(
      within(card).getByLabelText(`Select ${formatSessionDateTime(hoursFromNow(20))}`)
    )
    expect(
      within(card).queryByLabelText(`Select ${formatSessionDateTime(hoursFromNow(30))}`)
    ).not.toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Delete selected' }))
    await user.click(within(card).getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() =>
      expect(supabase.rpc.mock.calls.filter(([name]) => name === 'delete_empty_session')).toHaveLength(2)
    )
    expect(supabase.rpc).toHaveBeenCalledWith('delete_empty_session', { p_session_id: 'empty-1' })
    expect(supabase.rpc).toHaveBeenCalledWith('delete_empty_session', { p_session_id: 'empty-2' })
    expect(within(sectionFor('Upcoming bookings')).getByRole('button', { name: 'Cancel session' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('lists booked sessions across listings in chronological order', async () => {
    givenData({
      listings: [
        makeMyListing(),
        makeMyListing({ id: 'listing-2', title: 'Boxing' }),
      ],
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

    const upcoming = sectionFor('Upcoming bookings')
    const titles = within(upcoming)
      .getAllByText(/Latte art|Boxing/)
      .map((node) => node.textContent)
    expect(titles[0]).toBe('Boxing')
    expect(titles[1]).toBe('Latte art')
    expect(within(listingCard('Latte art')).queryByText(/guest/)).not.toBeInTheDocument()
    expect(within(listingCard('Boxing')).queryByText(/guest/)).not.toBeInTheDocument()
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

    expect(within(listingCard('Boxing')).getByLabelText('Time')).toBeInTheDocument()
    expect(within(listingCard('Latte art')).queryByLabelText('Time')).not.toBeInTheDocument()
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
    expect(within(listingCard('Latte art')).getAllByRole('checkbox')).toHaveLength(2)
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
    expect(within(card).getByRole('button', { name: 'Add sessions' })).toBeInTheDocument()
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
    expect(within(card).getByRole('link', { name: 'Edit listing' })).toHaveAttribute(
      'href',
      '/edit-listing/listing-1'
    )
  })

  it('reads the review state with the listings', async () => {
    givenData({ listings: [makeMyListing()] })
    await renderHosting()

    const select = supabase.__calls('listings', 'select')[0].chain[0].args[0]
    expect(select).toMatch(/review_status/)
    expect(select).toMatch(/review_note/)
  })

  it('flags a listing with no dates and leads with Add sessions', async () => {
    givenData({
      listings: [makeMyListing({ price_per_person: 2300, duration_mins: 90, max_guests: 4 })],
    })
    await renderHosting()

    const card = listingCard('Latte art')
    expect(within(card).getAllByText('No dates yet')).toHaveLength(2)
    expect(within(card).queryByText('Hidden: no sessions')).not.toBeInTheDocument()
    expect(within(card).getByText('S$23 · 90 min · up to 4')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Add sessions' }).className).toContain(
      'primary'
    )
  })

  it('marks a listing with dates as live and counts them instead of repeating the first row', async () => {
    const startsAt = hoursFromNow(30)
    givenData({
      listings: [makeMyListing()],
      hostSessions: [makeHostSession({ starts_at: startsAt, bookings: [] })],
    })
    await renderHosting()

    const card = listingCard('Latte art')
    expect(within(card).getByText('Live')).toBeInTheDocument()
    expect(within(card).getByText('1 open date')).toBeInTheDocument()
    expect(within(card).getAllByText(formatSessionDateTime(startsAt))).toHaveLength(1)
    expect(within(card).queryByText(/^Next:/)).not.toBeInTheDocument()
    expect(within(card).queryByText('No dates yet')).not.toBeInTheDocument()
  })

  it('counts a booked date, which sits under Upcoming bookings rather than the card', async () => {
    givenData({
      listings: [makeMyListing()],
      hostSessions: [
        makeHostSession({ id: 'booked', starts_at: hoursFromNow(30) }),
        makeHostSession({ id: 'open', starts_at: hoursFromNow(60), bookings: [] }),
      ],
    })
    await renderHosting()

    expect(within(listingCard('Latte art')).getByText('1 open date · 1 booked')).toBeInTheDocument()
    expect(within(sectionFor('Upcoming bookings')).getByText('Latte art')).toBeInTheDocument()
  })

  it('says when every date is booked', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    await renderHosting()

    expect(within(listingCard('Latte art')).getByText('1 booked · no open dates')).toBeInTheDocument()
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
    expect(within(setup).getByText('Stripe needs your bank details to pay you.')).toBeInTheDocument()
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

    expect(screen.getByRole('button', { name: 'Leave a review' })).toBeInTheDocument()
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

    expect(screen.queryByRole('button', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('does not invite a review before the session', async () => {
    givenData({ bookings: [makeBooking()] })
    await renderBookings()

    expect(screen.queryByRole('button', { name: 'Leave a review' })).not.toBeInTheDocument()
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

    expect(screen.queryByRole('button', { name: 'Leave a review' })).not.toBeInTheDocument()
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

    expect(screen.getByRole('button', { name: 'Leave a review' })).toBeInTheDocument()
  })

  it('does not invite a review on a pending booking', async () => {
    givenData({ bookings: [makeBooking({ ...pastBooking(), status: 'pending' })] })
    await renderBookings()

    expect(screen.queryByRole('button', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('centres the status badge and review action on one line', async () => {
    givenData({ bookings: [pastBooking()] })
    await renderBookings()

    const reviewButton = screen.getByRole('button', { name: 'Leave a review' })
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

    expect(screen.queryByRole('button', { name: 'Leave a review' })).not.toBeInTheDocument()
    expect(screen.getByText('Review submitted')).toBeInTheDocument()
  })

  it('does not invite a review on a cancelled booking', async () => {
    givenData({
      bookings: [
        makeBooking({ ...pastBooking(), status: 'cancelled', stripe_charge_id: 'ch_1' }),
      ],
    })
    await renderBookings()

    expect(screen.queryByRole('button', { name: 'Leave a review' })).not.toBeInTheDocument()
  })

  it('requires a star rating', async () => {
    givenData({ bookings: [pastBooking()] })
    const { user } = await renderBookings()

    await user.click(screen.getByRole('button', { name: 'Leave a review' }))
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    expect(await screen.findByText('Please select a star rating.')).toBeInTheDocument()
    expect(supabase.__calls('reviews', 'insert')).toHaveLength(0)
  })

  it('saves the review against the host', async () => {
    givenData({ bookings: [pastBooking()] })
    const { user } = await renderBookings()

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
    const { user } = await renderBookings()

    await user.click(screen.getByRole('button', { name: 'Leave a review' }))
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    await waitFor(() => expect(supabase.__calls('reviews', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('reviews', 'insert').payload.comment).toBeNull()
  })

  it('marks the booking as reviewed once saved', async () => {
    givenData({ bookings: [pastBooking()] })
    const { user } = await renderBookings()

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
          sessions: {
            starts_at: hoursFromNow(-5),
            duration_mins: 90,
            listings: { title: 'Latte art' },
          },
        }),
      ],
    })
    const { user } = await renderBookings()

    await user.click(screen.getByRole('button', { name: 'Leave a review' }))
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    expect(await screen.findByText('Could not find host for this booking.')).toBeInTheDocument()
    expect(supabase.__calls('reviews', 'insert')).toHaveLength(0)
  })

  it('reports a rejected review', async () => {
    givenData({ bookings: [pastBooking()] })
    supabase.__on('reviews', 'insert', {
      error: {
        message:
          'duplicate key value violates unique constraint "reviews_booking_id_role_key"',
      },
    })
    const { user } = await renderBookings()

    await user.click(screen.getByRole('button', { name: 'Leave a review' }))
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    expect(
      await screen.findByText(
        'duplicate key value violates unique constraint "reviews_booking_id_role_key"'
      )
    ).toBeInTheDocument()
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
