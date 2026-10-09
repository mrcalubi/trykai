import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Bookings from './Bookings'
import Hosting from './Hosting'
import Dashboard from './Dashboard'
import RedirectToOwnProfile from './RedirectToOwnProfile'
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
    data: {
      stripe_payouts_enabled: true,
      is_host: isHost ?? listings.length > 0,
      host_strikes: hostStrikes,
    },
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
  return {
    id: 'listing-1',
    title: 'Latte art',
    area: 'Bedok',
    category: 'Food',
    photo_urls: ['https://cdn.test/latte.jpg'],
    duration_mins: 90,
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
  await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
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
  return within(sectionFor('My Listings')).getByText(title).closest('.dashboard-card')
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
    expect(screen.queryByRole('heading', { name: 'My Listings' })).not.toBeInTheDocument()
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
  })

  it('reports a load failure on hosting', async () => {
    givenData({ isHost: true })
    supabase.__on('listings', 'select', { data: null, error: { message: 'permission denied' } })
    await renderHosting()

    expect(screen.getByText('permission denied')).toBeInTheDocument()
  })

  it('reports a load failure on bookings', async () => {
    supabase.__on('bookings', 'select', { data: null, error: { message: 'permission denied' } })
    await renderBookings()

    expect(screen.getByText('permission denied')).toBeInTheDocument()
  })
})

describe('Dashboard verification review', () => {
  it('offers a slim review banner to an admin when submissions are waiting', async () => {
    supabase.rpc.mockImplementation(async (name) => {
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
    supabase.rpc.mockImplementation(async (name) => {
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

    expect(screen.getByText('No upcoming sessions.')).toBeInTheDocument()
    const listings = sectionFor('My Listings')
    expect(within(listings).getByRole('link', { name: 'Create one' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(within(listings).getByRole('link', { name: '+ New listing' })).toHaveAttribute(
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
    expect(within(card).getByRole('button', { name: 'Add session' }).className).toContain(
      'hosting-listing__add'
    )
    expect(within(sectionFor('My Listings')).getByRole('link', { name: '+ New listing' })).toHaveAttribute(
      'href',
      '/create-listing'
    )
    expect(card.querySelector('.hosting-listing__text')).toBeInTheDocument()
    expect(card.querySelector('.hosting-listing__menu')).toBeInTheDocument()
    expect(card.className).toContain('hosting-listing-card')
  })

  it('keeps thumbnail and title on one line, the menu in the card corner, and two columns from 1024px', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
    const listing = css.match(/\.hosting-listing \{[\s\S]*?\n\}/)
    const main = css.match(/\.hosting-listing__main \{[\s\S]*?\n\}/)
    const text = css.match(/\.hosting-listing__text \{[\s\S]*?\n\}/)
    const menu = css.match(/\.ui-overflow\.hosting-listing__menu \{[\s\S]*?\n\}/)
    const add = css.match(/\.hosting-listing__add \{[\s\S]*?\n\}/)
    const card = css.match(/\.dashboard-card\.hosting-listing-card \{[\s\S]*?\n\}/)
    const listings = css.match(/\.dashboard-list--listings \{[\s\S]*?\n\}/)
    expect(listing?.[0]).toMatch(/flex-direction:\s*column/)
    expect(listing?.[0]).not.toMatch(/flex-wrap:\s*wrap/)
    expect(main?.[0]).toMatch(/display:\s*flex/)
    expect(main?.[0]).not.toMatch(/flex-direction:\s*column/)
    expect(text?.[0]).toMatch(/flex:\s*1/)
    expect(text?.[0]).toMatch(/min-width:\s*0/)
    expect(menu?.[0]).toMatch(/position:\s*absolute/)
    expect(menu?.[0]).toMatch(/top:\s*4px/)
    expect(menu?.[0]).toMatch(/right:\s*4px/)
    expect(add?.[0]).toMatch(/width:\s*100%/)
    expect(card?.[0]).toMatch(/padding:\s*12px/)
    expect(listings?.[0]).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(css).toMatch(
      /@media \(min-width: 1024px\) \{\s*\.dashboard-list--listings \{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    )
    expect(css).not.toMatch(
      /@media \(min-width: 768px\) \{\s*\.hosting-listing \{\s*flex-direction:\s*row;/
    )
    expect(css).not.toMatch(
      /@media \(min-width: 768px\) \{\s*\.dashboard-list--listings \{\s*grid-template-columns:\s*repeat\(2/
    )
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
    supabase.rpc.mockImplementation(async (name, args) => {
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
    supabase.rpc.mockImplementation(async (name, args) => {
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
    supabase.rpc.mockImplementation(async (name, args) => {
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
    expect(screen.getByText('Latte art')).toBeInTheDocument()
  })

  it('reports a failed deletion', async () => {
    givenData({ listings: [makeMyListing()] })
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'delete_listing') {
        return { data: null, error: { message: 'not your listing' } }
      }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()

    await openDeleteListing(user)
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
    await user.click(screen.getByRole('button', { name: 'Add session' }))
  }

  function fillSession({ date = '2099-09-01', time = '10:30', spots = '4' } = {}) {
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: time } })
    fireEvent.change(screen.getByLabelText('Spots total'), { target: { value: spots } })
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
    expect(screen.getByText('Latte art')).toBeInTheDocument()

    await openSessionForm(user)
    expect(screen.getByLabelText('Duration (mins)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Duration (mins)'), { target: { value: '60' } })
    fillSession()

    await user.click(screen.getByRole('button', { name: 'Add session' }))

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

    expect(screen.getByText('Each session is 90 minutes.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Duration (mins)')).not.toBeInTheDocument()
  })

  it('stores the start time as UTC converted from Singapore time', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    fillSession({ date: '2099-09-01', time: '10:30' })

    await user.click(screen.getByRole('button', { name: 'Add session' }))

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('add_listing_session', {
        p_listing_id: 'listing-1',
        p_starts_at: '2099-09-01T02:30:00.000Z',
        p_spots: 4,
      })
    )
    expect(supabase.__calls('sessions', 'insert')).toHaveLength(0)
  })

  it('sends the spot count and lets the database set the length', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    fillSession({ spots: '6' })

    await user.click(screen.getByRole('button', { name: 'Add session' }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    const [, args] = supabase.rpc.mock.calls.find(([name]) => name === 'add_listing_session')
    expect(args.p_spots).toBe(6)
    expect(args).not.toHaveProperty('duration_mins')
  })

  it('says when the same time was added onto the existing session', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'add_listing_session') {
        return {
          data: {
            action: 'merged',
            spots_added: 4,
            spots_remaining: 7,
            starts_at: '2099-09-01T02:30:00.000Z',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()
    await openSessionForm(user)
    fillSession()

    await user.click(screen.getByRole('button', { name: 'Add session' }))

    expect(
      await screen.findByText(
        'Added 4 spots to the session on Tue, 1 Sept at 10:30 am. 7 spots left.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()
  })

  it('rejects a session with no date or time', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    fireEvent.submit(document.querySelector('.dashboard-card__form'))

    expect(await screen.findByText('Please enter a date and time.')).toBeInTheDocument()
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'add_listing_session')).toBe(false)
  })

  it('rejects a time that has already passed', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    fillSession({ date: '2020-01-01', time: '10:30' })
    fireEvent.submit(document.querySelector('.dashboard-card__form'))

    expect(await screen.findByText('Choose a time in the future.')).toBeInTheDocument()
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'add_listing_session')).toBe(false)
  })

  it('rejects a session with no spots', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    fillSession({ spots: '0' })
    fireEvent.submit(document.querySelector('.dashboard-card__form'))

    expect(await screen.findByText('Spots total must be at least 1.')).toBeInTheDocument()
  })

  it('closes the form after a successful save', async () => {
    const { user } = await renderHosting()
    await openSessionForm(user)
    fillSession()

    await user.click(screen.getByRole('button', { name: 'Add session' }))

    await waitFor(() => expect(screen.queryByLabelText('Date')).not.toBeInTheDocument())
  })

  it('keeps the form open and shows the error when the save fails', async () => {
    supabase.rpc.mockImplementation(async (name) => {
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
    fillSession()

    await user.click(screen.getByRole('button', { name: 'Add session' }))

    expect(
      await screen.findByText(
        'That time overlaps the session on Fri, 9 Oct at 11:11 am (90 mins).'
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
  })
})

describe('Dashboard guest cancellation', () => {
  it('offers cancellation for an upcoming confirmed booking', async () => {
    givenData({ bookings: [makeBooking()] })
    await renderBookings()

    expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
  })

  it('does not offer cancellation once the session has passed', async () => {
    givenData({
      bookings: [makeBooking({ sessions: { starts_at: hoursFromNow(-2), listings: {} } })],
    })
    await renderBookings()

    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('does not offer cancellation for an already cancelled booking', async () => {
    givenData({ bookings: [makeBooking({ status: 'cancelled' })] })
    await renderBookings()

    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('shows Unknown listing / Date TBC when the nested session is missing', async () => {
    givenData({ bookings: [makeBooking({ sessions: null })] })
    await renderBookings()

    expect(screen.getByText('Unknown listing')).toBeInTheDocument()
    expect(screen.getByText('Date TBC')).toBeInTheDocument()
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

    expect(within(sectionFor('Upcoming Hosted Sessions')).getByText('Latte art')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel session' })).toBeInTheDocument()
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

    expect(within(sectionFor('Upcoming Hosted Sessions')).getAllByText('Latte art')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Cancel session' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
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
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'delete_empty_session') return { data: 'session-1', error: null }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() =>
      expect(
        within(sectionFor('Upcoming Hosted Sessions')).queryByText('Latte art')
      ).not.toBeInTheDocument()
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
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'delete_empty_session') {
        return { data: null, error: { message: 'not allowed' } }
      }
      return { data: null, error: null }
    })
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect(await screen.findByText('not allowed')).toBeInTheDocument()
    expect(within(sectionFor('Upcoming Hosted Sessions')).getByText('Latte art')).toBeInTheDocument()
  })

  it('does not offer Delete on a session with a confirmed booking', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    await renderHosting()

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel session' })).toBeInTheDocument()
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'delete_empty_session')).toBe(false)
  })

  it('warns about the strike before cancelling', async () => {
    givenData({ listings: [makeMyListing()], hostSessions: [makeHostSession()] })
    const { user } = await renderHosting()

    await user.click(screen.getByRole('button', { name: 'Cancel session' }))

    expect(screen.getByText(/add a strike to your account/)).toBeInTheDocument()
    expect(screen.getByText('Full refund of $90')).toBeInTheDocument()
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
})

describe('Dashboard payout setup', () => {
  it('asks a host without payouts enabled to set them up', async () => {
    givenData({ listings: [makeMyListing()] })
    supabase.__on('users', 'select', {
      data: { stripe_payouts_enabled: false, is_host: true },
      error: null,
    })
    await renderHosting()

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
    const { user } = await renderHosting()

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
    const { user } = await renderHosting()

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
        <Hosting />
      </RequireAuth>,
      { route: '/hosting?connect=return', path: '/hosting' }
    )

    expect(
      await screen.findByText('Payout setup submitted. It can take a minute for Stripe to confirm.')
    ).toBeInTheDocument()
  })

  it('asks the host to finish onboarding when Stripe sends them back to refresh', async () => {
    givenData({ listings: [makeMyListing()] })
    renderWithRouter(
      <RequireAuth>
        <Hosting />
      </RequireAuth>,
      { route: '/hosting?connect=refresh', path: '/hosting' }
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
        duration_mins: 90,
        listings: { title: 'Latte art', host_id: HOST_ID },
      },
    })

  it('invites a review after the session has happened', async () => {
    givenData({ bookings: [pastBooking()] })
    await renderBookings()

    expect(screen.getByRole('button', { name: 'Leave a review' })).toBeInTheDocument()
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
    expect(reviewButton).toHaveClass('ui-button', 'ui-button--secondary')
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
    givenData({ bookings: [makeBooking({ ...pastBooking(), status: 'cancelled' })] })
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
})
