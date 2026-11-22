import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EditListing from './EditListing'
import RequireAuth from '../components/RequireAuth'
import SiteNav from '../components/SiteNav'
import { supabase } from '../lib/supabase'
import { renderWithDataRouter } from '../test/render'
import { makeAuthSession, makeListing } from '../test/fixtures'
import {
  LISTING_FIELD_HINTS,
  LISTING_SAVE_ERROR,
  PHOTO_UPLOAD_ERROR,
} from '../lib/listingFieldHints'
import {
  LISTING_DELETE_ACTIVE_BOOKINGS,
  LISTING_DELETE_FAILED,
  LISTING_DELETE_SESSIONS_UNAVAILABLE,
} from '../lib/listingDelete'

vi.mock('../lib/supabase')

const HOST_ID = 'host-9'

function givenSignedIn(userId = HOST_ID) {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: userId } }) },
    error: null,
  })
}

function givenFoundingHost(
  value,
  error = null,
  spots = { updated: 0, held: [] },
  address = '12 Coffee Road',
  arrival = null,
) {
  supabase.rpc.mockImplementation(async (fn) => {
    if (fn === 'my_is_founding_host') {
      return error ? { data: null, error } : { data: value, error: null }
    }
    if (fn === 'set_listing_spots') {
      return { data: spots, error: null }
    }
    if (fn === 'listing_address') {
      return { data: address, error: null }
    }
    if (fn === 'listing_arrival_instructions') {
      return { data: arrival, error: null }
    }
    return { data: null, error: null }
  })
}

function givenListing(overrides = {}) {
  supabase.__on('listings', 'select', {
    data: makeListing({
      title: 'Latte art',
      description: 'Pull a rosetta.',
      category: 'Food',
      price_per_person: 4500,
      max_guests: 4,
      area: 'Bedok',
      whats_provided: ['Materials'],
      photo_urls: ['https://cdn.test/one.jpg'],
      ...overrides,
    }),
    error: null,
  })
}

// Mounted behind the same guard App.jsx puts it behind, so the page always has
// a signed-in user. RequireAuth owns the signed-out case and tests it itself.
function renderPage(options = {}) {
  const search = options.section ? `?section=${options.section}` : ''
  return renderWithDataRouter(
    <RequireAuth>
      {options.withNav ? <SiteNav /> : null}
      <EditListing />
    </RequireAuth>,
    {
      route: `/edit-listing/listing-1${search}`,
      path: '/edit-listing/:id',
      extraRoutes: options.extraRoutes,
    },
  )
}

async function renderLoaded(options = {}) {
  const utils = renderPage(options)
  await screen.findByRole('navigation', { name: 'Listing sections' })
  return utils
}

function sectionLink(name) {
  return within(screen.getByRole('navigation', { name: 'Listing sections' })).getByRole('link', {
    name: new RegExp(`^${name}`),
  })
}

function saveButton() {
  return screen.getByRole('button', { name: 'Save changes' })
}

function saveStatus() {
  return document.querySelector('.edit-savebar__status')
}

/** Saving needs a change; a title edit is the smallest one. */
async function editTitle(user, value = 'Latte art two') {
  await user.clear(screen.getByLabelText('Title'))
  await user.type(screen.getByLabelText('Title'), value)
}

function imageFile(name = 'new.png') {
  return new File(['binary'], name, { type: 'image/png' })
}

beforeEach(() => {
  supabase.__reset()
  givenSignedIn()
  givenListing()
  givenFoundingHost(false)
})

describe('EditListing access control', () => {
  it('only loads a listing the signed-in user hosts', async () => {
    await renderLoaded()

    const call = supabase.__lastCall('listings', 'select')
    expect(call.filters).toContainEqual({ method: 'eq', column: 'id', value: 'listing-1' })
    expect(call.filters).toContainEqual({ method: 'eq', column: 'host_id', value: HOST_ID })
    expect(call.chain[0].args[0]).not.toMatch(/full_address/)
    expect(call.chain[0].args[0]).not.toMatch(/\*/)
    expect(supabase.rpc).toHaveBeenCalledWith('listing_address', { listing_id: 'listing-1' })
    expect(supabase.rpc).toHaveBeenCalledWith('listing_arrival_instructions', {
      listing_id: 'listing-1',
    })
    expect(call.chain[0].args[0]).toMatch(/booking_cutoff_hours/)
    expect(call.chain[0].args[0]).toMatch(/review_status/)
    expect(call.chain[0].args[0]).not.toMatch(/arrival_instructions/)
  })

  it('retries load without booking_cutoff_hours when the column is missing', async () => {
    let selects = 0
    supabase.__on('listings', 'select', () => {
      selects += 1
      if (selects === 1) {
        return { data: null, error: { message: 'column listings.booking_cutoff_hours does not exist' } }
      }
      return {
        data: makeListing({
          title: 'Latte art',
          description: 'Pull a rosetta.',
          category: 'Food',
          price_per_person: 4500,
          max_guests: 4,
          area: 'Bedok',
          whats_provided: ['Materials'],
          photo_urls: ['https://cdn.test/one.jpg'],
        }),
        error: null,
      }
    })
    await renderLoaded()
    expect(selects).toBeGreaterThanOrEqual(2)
  })

  it('shows a not-found message for a listing that is not theirs', async () => {
    supabase.__on('listings', 'select', { data: null, error: null })
    renderPage()

    expect(await screen.findByText('Listing not found.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Listing sections' })).not.toBeInTheDocument()
  })

  it('surfaces a fetch error instead of the form', async () => {
    supabase.__on('listings', 'select', { data: null, error: { message: 'permission denied' } })
    renderPage()

    expect(
      await screen.findByText('Something went wrong loading this page. Please refresh.')
    ).toBeInTheDocument()
    expect(screen.queryByText('permission denied')).not.toBeInTheDocument()
  })
})

describe('EditListing overview', () => {
  it('lists every section with what is in it now', async () => {
    givenListing({ duration_mins: 120, what_to_bring: ['Water bottle'] })
    await renderLoaded()

    expect(screen.getByRole('heading', { name: 'Edit listing', level: 1 })).toBeInTheDocument()
    expect(sectionLink('The basics')).toHaveTextContent('Food · Latte art')
    expect(sectionLink('Price and time')).toHaveTextContent('Guests pay S$51 · 4 spots · 2 hr')
    expect(sectionLink('Booking notice')).toHaveTextContent('Guests can book until 3 hr before')
    expect(sectionLink("What's provided")).toHaveTextContent('Materials')
    expect(sectionLink('What to bring')).toHaveTextContent('Water bottle')
    expect(sectionLink('Price and time')).toHaveAttribute('href', '/edit-listing/listing-1?section=price')
    for (const heading of ['The session', 'Booking', 'What guests see', 'Listing status']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
  })

  it('marks quick wins: directions for guests and more photos', async () => {
    await renderLoaded()

    expect(sectionLink('Location')).toHaveTextContent('Bedok · add directions for guests')
    expect(sectionLink('Location')).toHaveClass('edit-nav__row--todo')
    expect(sectionLink('Photos')).toHaveTextContent('1 photo · add 4 more')
    expect(sectionLink('The basics')).not.toHaveClass('edit-nav__row--todo')
    expect(screen.getByText('2 quick wins')).toBeInTheDocument()
  })

  it('drops a quick win once it is done', async () => {
    givenFoundingHost(false, null, { updated: 0, held: [] }, '12 Coffee Road', 'Ring the bell')
    givenListing({
      photo_urls: ['a', 'b', 'c', 'd', 'e'].map((name) => `https://cdn.test/${name}.jpg`),
    })
    await renderLoaded()

    expect(sectionLink('Location')).toHaveTextContent('Bedok')
    expect(sectionLink('Location')).not.toHaveClass('edit-nav__row--todo')
    expect(sectionLink('Photos')).toHaveTextContent('5 photos')
    expect(screen.queryByText(/quick win/)).not.toBeInTheDocument()
  })

  it('shows the status, the next date and how full it is', async () => {
    givenListing({ review_status: 'approved' })
    supabase.__on('sessions', 'select', {
      data: [
        {
          id: 's-next',
          listing_id: 'listing-1',
          starts_at: '2099-06-10T02:00:00.000Z',
          bookings: [{ id: 'b1', status: 'confirmed', guests_count: 2 }],
        },
      ],
      error: null,
    })
    await renderLoaded()

    expect(screen.getAllByText('Live').length).toBeGreaterThan(0)
    // Once in the desktop header, once on the phone summary card.
    expect(screen.getAllByText(/^Next: .+ · 2 of 4 booked$/)).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /Manage dates/ })[0]).toHaveAttribute('href', '/hosting')
    expect(screen.getAllByRole('link', { name: /Preview/ })[0]).toHaveAttribute('href', '/listings/listing-1')
  })

  it('puts Manage dates with the next date, and Preview under the guest card', async () => {
    supabase.__on('sessions', 'select', {
      data: [
        {
          id: 's-next',
          listing_id: 'listing-1',
          starts_at: '2099-06-10T02:00:00.000Z',
          bookings: [],
        },
      ],
      error: null,
    })
    await renderLoaded()

    const meta = document.querySelector('.edit-head__meta')
    expect(meta).toHaveTextContent(/^Next: .+ · 0 of 4 booked/)
    expect(within(meta).getByRole('link', { name: 'Manage dates' })).toHaveAttribute('href', '/hosting')
    expect(document.querySelector('.edit-head__actions')).toBeNull()

    const preview = screen.getByRole('complementary', { name: 'How guests see it' })
    expect(within(preview).getByRole('link', { name: 'Preview full listing' })).toHaveAttribute(
      'href',
      '/listings/listing-1',
    )
  })

  it('still offers Manage dates when no date is coming up', async () => {
    await renderLoaded()
    const meta = document.querySelector('.edit-head__meta')
    expect(meta).not.toHaveTextContent('Next:')
    expect(within(meta).getByRole('link', { name: 'Manage dates' })).toBeInTheDocument()
  })

  it('says a listing is in review', async () => {
    givenListing({ review_status: 'pending' })
    await renderLoaded()
    expect(screen.getAllByText('In review').length).toBeGreaterThan(0)
  })

  it('leaves out add-ons and session types when those tables are missing', async () => {
    supabase.__on('listing_addons', 'select', {
      data: null,
      error: { code: '42P01', message: 'relation "public.listing_addons" does not exist' },
    })
    await renderLoaded({ section: 'addons' })

    expect(
      within(screen.getByRole('navigation', { name: 'Listing sections' })).queryByRole('link', {
        name: /^Add-ons/,
      }),
    ).not.toBeInTheDocument()
    // Asking for a missing section falls back to the overview.
    expect(document.querySelector('.edit-page--overview')).toBeInTheDocument()
  })
})

describe('EditListing sections', () => {
  it('opens the basics beside the overview when no section is asked for', async () => {
    await renderLoaded()

    expect(document.querySelector('.edit-page--overview')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The basics', level: 2 })).toBeInTheDocument()
    expect(sectionLink('The basics')).toHaveAttribute('aria-current', 'page')
  })

  it('opens one section at a time from the overview', async () => {
    const { user, currentSearch } = await renderLoaded()

    await user.click(sectionLink('Price and time'))

    expect(currentSearch()).toBe('?section=price')
    expect(document.querySelector('.edit-page--section')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Price and time', level: 2 })).toBeInTheDocument()
    expect(
      screen.getByText('Changes apply to new bookings. Existing bookings keep their price.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'All sections' }))
    expect(currentSearch()).toBe('')
  })

  it('keeps unsaved edits when moving between sections, without asking', async () => {
    const { user } = await renderLoaded({ section: 'basics' })
    await editTitle(user, 'Latte art two')
    expect(saveStatus()).toHaveTextContent('Unsaved changes')

    await user.click(sectionLink('Price and time'))
    expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).not.toBeInTheDocument()
    expect(saveStatus()).toHaveTextContent('Unsaved changes')

    await user.click(saveButton())
    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.title).toBe('Latte art two')
  })

  it('still asks before leaving the page with unsaved edits', async () => {
    const { user } = await renderLoaded({
      withNav: true,
      extraRoutes: <Route path="/" element={<h1>Home</h1>} />,
    })
    await editTitle(user)
    await user.click(screen.getByRole('link', { name: 'TryKai home' }))

    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument()
  })

  it('discards unsaved edits back to what was saved', async () => {
    const { user } = await renderLoaded()
    expect(saveButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled()
    expect(saveStatus()).toHaveTextContent('All changes saved')

    await editTitle(user, 'Something else')
    expect(saveButton()).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.getByLabelText('Title')).toHaveValue('Latte art')
    expect(saveStatus()).toHaveTextContent('All changes saved')
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })

  it('opens the section with the problem when a save is checked', async () => {
    const { user, currentSearch } = await renderLoaded({ section: 'basics' })
    await user.clear(screen.getByLabelText('Title'))
    await user.click(sectionLink('Price and time'))

    await user.click(saveButton())

    expect(currentSearch()).toBe('?section=basics')
    expect(await screen.findByText(LISTING_FIELD_HINTS.title)).toBeInTheDocument()
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })

  it('shows the guest card as the host edits', async () => {
    const { user } = await renderLoaded()
    const preview = screen.getByRole('complementary', { name: 'How guests see it' })
    expect(preview).toHaveTextContent('Latte art')
    expect(preview).toHaveTextContent('S$51/person')

    await editTitle(user, 'Latte art for two')
    expect(preview).toHaveTextContent('Latte art for two')
    expect(preview).toHaveTextContent('Only saved changes go live.')
  })
})

describe('EditListing prefill', () => {
  it('fills the basics with the saved listing', async () => {
    await renderLoaded({ section: 'basics' })

    expect(screen.getByLabelText('Title')).toHaveValue('Latte art')
    expect(screen.getByLabelText('Description')).toHaveValue('Pull a rosetta.')
    expect(screen.getByLabelText('Category')).toHaveValue('Food')
  })

  it('fills price and time', async () => {
    await renderLoaded({ section: 'price' })

    expect(screen.getByLabelText('Your price per guest')).toHaveValue(45)
    expect(screen.getByLabelText('Spots per session')).toHaveTextContent('4')
    expect(screen.getByRole('radio', { name: '1.5 hr' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Group discounts' })).toBeChecked()
  })

  it('fills the location', async () => {
    await renderLoaded({ section: 'location' })

    expect(screen.getByLabelText('Area guests see')).toHaveValue('Bedok')
    expect(screen.getByText('12 Coffee Road')).toBeInTheDocument()
    expect(screen.getByText('Hidden from guests until they book.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Postal code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Unit number (optional)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Full address/)).not.toBeInTheDocument()
  })

  it('shows a hand-typed lowercase address with capitals', async () => {
    givenFoundingHost(false, null, { updated: 0, held: [] }, 'ang mo kio ave 3')
    await renderLoaded({ section: 'location' })

    expect(screen.getByText('Ang Mo Kio Ave 3')).toBeInTheDocument()
    expect(screen.queryByText('ang mo kio ave 3')).not.toBeInTheDocument()
  })

  it('loads the address from listing_address, not the listings row', async () => {
    givenFoundingHost(false, null, { updated: 0, held: [] }, '88 Host Lane')
    await renderLoaded({ section: 'location' })

    expect(screen.getByText('88 Host Lane')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('listing_address', { listing_id: 'listing-1' })
    expect(supabase.__lastCall('listings', 'select').chain[0].args[0]).not.toMatch(/full_address/)
  })

  it('surfaces a listing_address error instead of an empty address field', async () => {
    supabase.rpc.mockImplementation(async (fn) => {
      if (fn === 'listing_address') return { data: null, error: { message: 'permission denied' } }
      if (fn === 'my_is_founding_host') return { data: false, error: null }
      return { data: null, error: null }
    })
    renderPage()

    expect(
      await screen.findByText('Something went wrong loading this page. Please refresh.')
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Full address/)).not.toBeInTheDocument()
  })

  it('shows what guests see and what the host gets, in S$', async () => {
    givenListing({ price_per_person: 4500 })
    await renderLoaded({ section: 'price' })

    const earnings = document.querySelector('.edit-earnings')
    expect(within(earnings).getByText('Guests see').nextSibling).toHaveTextContent('S$51 /person')
    expect(within(earnings).getByText('You get from your 4th booking (10% fee)').nextSibling).toHaveTextContent(
      'S$40.50',
    )
    expect(within(earnings).getByText('Full session of 4').nextSibling).toHaveTextContent('S$180')
    expect(
      screen.getByText('A group of 4 booking together pays you S$153 instead of S$180.'),
    ).toBeInTheDocument()
  })

  it('lists the group discount tiers only while discounts are on', async () => {
    const { user } = await renderLoaded({ section: 'price' })
    const table = screen.getByRole('table', { name: 'Group discount by group size' })
    expect(within(table).getAllByRole('row').map((row) => row.textContent)).toEqual([
      '2 guests−5%',
      '3 guests−10%',
      '4 guests−15%',
      '5 or more−20%',
    ])

    await user.click(screen.getByRole('switch', { name: 'Group discounts' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(/booking together pays you/)).not.toBeInTheDocument()
  })

  it('leaves the length unpicked and discounts off when the saved listing has none', async () => {
    givenListing({ duration_mins: null, group_pricing: false })
    await renderLoaded({ section: 'price' })

    for (const name of ['1 hr', '1.5 hr', '2 hr', '3 hr', 'Other']) {
      expect(screen.getByRole('radio', { name })).not.toBeChecked()
    }
    expect(screen.getByRole('switch', { name: 'Group discounts' })).not.toBeChecked()
  })

  it('shows a founding host their full price and no fee', async () => {
    givenFoundingHost(true)
    givenListing({ price_per_person: 2500 })
    await renderLoaded({ section: 'price' })

    expect(
      screen.getByText('You get, as a founding host (no fee)').nextSibling,
    ).toHaveTextContent('S$25')
    expect(screen.queryByText(/from your 4th booking/)).not.toBeInTheDocument()
  })

  it('leaves out what the host gets when founding-host status is unknown', async () => {
    givenFoundingHost(null, { message: 'function my_is_founding_host does not exist' })
    givenListing({ price_per_person: 2500 })
    await renderLoaded({ section: 'price' })

    expect(screen.getByLabelText('Your price per guest')).toHaveValue(25)
    expect(screen.getByText('Guests see')).toBeInTheDocument()
    expect(screen.queryByText(/You get/)).not.toBeInTheDocument()
  })

  it('keeps the cents of a stored price that is not a whole dollar', async () => {
    givenListing({ price_per_person: 1999 })
    const { user } = await renderLoaded({ section: 'price' })

    expect(screen.getByLabelText('Your price per guest')).toHaveValue(19.99)
    // Saving something else leaves the price as it was: it is not even sent.
    await user.click(screen.getByRole('button', { name: 'More spots' }))
    await user.click(saveButton())
    await waitFor(() => expect(saveStatus()).toHaveTextContent(/^Saved\./))
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })

  it('ticks the saved "what is provided" options', async () => {
    givenListing({ whats_provided: ['Materials', 'Equipment'] })
    await renderLoaded({ section: 'provided' })

    expect(screen.getByRole('checkbox', { name: 'Materials' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Equipment' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'None' })).not.toBeChecked()
  })

  it('copes with a listing that has no provided list', async () => {
    givenListing({ whats_provided: null })
    await renderLoaded({ section: 'provided' })

    expect(screen.getByRole('checkbox', { name: 'Materials' })).not.toBeChecked()
    expect(sectionLink("What's provided")).toHaveTextContent('Nothing listed yet')
  })

  it('shows the existing photos and the shots still to take', async () => {
    givenListing({ photo_urls: ['https://cdn.test/one.jpg', 'https://cdn.test/two.jpg'] })
    await renderLoaded({ section: 'photos' })

    expect(screen.getByText('2 of 8')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^What guests make/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^You teaching/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Your space/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^A close-up/ })).toBeInTheDocument()
    expect(screen.getByText(/Daylight from a window/)).toBeInTheDocument()
  })

  it('copes with a listing that has no photos', async () => {
    givenListing({ photo_urls: null })
    await renderLoaded({ section: 'photos' })

    expect(screen.getByText('0 of 8')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^What guests make/ })).toBeInTheDocument()
    expect(sectionLink('Photos')).toHaveTextContent('0 photos · add 5 more')
  })
})

describe('EditListing price and time', () => {
  it('steps the price in whole dollars, even from a cents price', async () => {
    givenListing({ price_per_person: 3293 })
    const { user } = await renderLoaded({ section: 'price' })

    await user.click(screen.getByRole('button', { name: 'Raise price by S$1' }))
    expect(screen.getByLabelText('Your price per guest')).toHaveValue(33)
    await user.click(screen.getByRole('button', { name: 'Lower price by S$1' }))
    expect(screen.getByLabelText('Your price per guest')).toHaveValue(32)
  })

  it('stops the price at S$1', async () => {
    givenListing({ price_per_person: 200 })
    const { user } = await renderLoaded({ section: 'price' })
    await user.click(screen.getByRole('button', { name: 'Lower price by S$1' }))
    expect(screen.getByLabelText('Your price per guest')).toHaveValue(1)
    expect(screen.getByRole('button', { name: 'Lower price by S$1' })).toBeDisabled()
  })

  it('asks for whole dollars when a new price has cents', async () => {
    const { user } = await renderLoaded({ section: 'price' })
    await user.clear(screen.getByLabelText('Your price per guest'))
    await user.type(screen.getByLabelText('Your price per guest'), '55.25')

    await user.click(saveButton())

    expect(await screen.findByText(LISTING_FIELD_HINTS.priceWhole)).toBeInTheDocument()
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })

  it('steps spots between 1 and 50', async () => {
    givenListing({ max_guests: 2 })
    const { user } = await renderLoaded({ section: 'price' })
    await user.click(screen.getByRole('button', { name: 'Fewer spots' }))
    expect(screen.getByLabelText('Spots per session')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Fewer spots' })).toBeDisabled()
  })

  it('picks a length from the chips or types minutes under Other', async () => {
    const { user } = await renderLoaded({ section: 'price' })
    await user.click(screen.getByRole('radio', { name: '3 hr' }))
    await user.click(screen.getByRole('radio', { name: 'Other' }))
    await user.type(screen.getByLabelText('Minutes'), '45')
    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.duration_mins).toBe(45)
  })

  it('opens Other for a saved length that is not one of the chips', async () => {
    givenListing({ duration_mins: 45 })
    await renderLoaded({ section: 'price' })
    expect(screen.getByRole('radio', { name: 'Other' })).toBeChecked()
    expect(screen.getByLabelText('Minutes')).toHaveValue(45)
  })
})

describe('EditListing validation', () => {
  it('rejects a title that is only whitespace', async () => {
    const { user } = await renderLoaded({ section: 'basics' })
    await editTitle(user, '   ')

    await user.click(saveButton())

    expect(await screen.findByText(LISTING_FIELD_HINTS.title)).toBeInTheDocument()
    expect(document.querySelector('.error-message')).not.toBeInTheDocument()
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })

  it('rejects a price of zero', async () => {
    const { user } = await renderLoaded({ section: 'price' })
    await user.clear(screen.getByLabelText('Your price per guest'))
    await user.type(screen.getByLabelText('Your price per guest'), '0')

    await user.click(saveButton())

    expect(await screen.findByText(LISTING_FIELD_HINTS.price)).toBeInTheDocument()
  })

  it('rejects a price above the ceiling', async () => {
    const { user } = await renderLoaded({ section: 'price' })
    await user.clear(screen.getByLabelText('Your price per guest'))
    await user.type(screen.getByLabelText('Your price per guest'), '7580')

    await user.click(saveButton())

    expect(await screen.findByText(LISTING_FIELD_HINTS.price)).toBeInTheDocument()
  })

  it('rejects an empty price', async () => {
    const { user } = await renderLoaded({ section: 'price' })
    await user.clear(screen.getByLabelText('Your price per guest'))

    await user.click(saveButton())

    expect(await screen.findByText(LISTING_FIELD_HINTS.price)).toBeInTheDocument()
  })

  it('rejects a length of zero minutes', async () => {
    const { user } = await renderLoaded({ section: 'price' })
    await user.click(screen.getByRole('radio', { name: 'Other' }))
    await user.type(screen.getByLabelText('Minutes'), '0')

    await user.click(saveButton())

    expect(await screen.findByText(LISTING_FIELD_HINTS.duration)).toBeInTheDocument()
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })
})

describe('EditListing saving', () => {
  it('saves the edited fields against the host own listing', async () => {
    const { user } = await renderLoaded({ section: 'basics' })
    await editTitle(user, 'Latte art, level two ')
    await user.click(sectionLink('Price and time'))
    await user.click(screen.getByRole('button', { name: 'Raise price by S$1' }))

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    const call = supabase.__lastCall('listings', 'update')
    // Only what changed: an older tab saving its own edit cannot put back the
    // fields another save corrected.
    expect(call.payload).toEqual({
      title: 'Latte art, level two',
      price_per_person: 4600,
    })
    expect(call.filters).toContainEqual({ method: 'eq', column: 'host_id', value: HOST_ID })
  })

  it('saves the booking notice and How to find me without sending the listing back for review', async () => {
    givenFoundingHost(false, null, { updated: 0, held: [] }, '12 Coffee Road', 'Ring the bell')
    givenListing({ booking_cutoff_hours: 6 })
    const { user } = await renderLoaded({ section: 'notice' })

    expect(screen.getByLabelText('6 hr')).toBeChecked()
    await user.click(screen.getByLabelText('12 hr'))
    expect(screen.getByText(/the last booking is at 7 am that day/)).toBeInTheDocument()
    await user.click(sectionLink('Location'))
    expect(screen.getByLabelText(/How to find me/)).toHaveValue('Ring the bell')
    await user.clear(screen.getByLabelText(/How to find me/))
    await user.type(screen.getByLabelText(/How to find me/), 'Lift B to #04-56')
    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload).toMatchObject({
      booking_cutoff_hours: 12,
      arrival_instructions: 'Lift B to #04-56',
    })
  })

  it('saves a listing that has moved to a new address', async () => {
    const { user } = await renderLoaded({ section: 'location' })
    await user.clear(screen.getByLabelText('Area guests see'))
    await user.type(screen.getByLabelText('Area guests see'), 'Tampines')
    await user.click(screen.getByRole('option', { name: 'Tampines' }))
    supabase.functions.invoke.mockResolvedValue({
      data: {
        results: [{ address: '5 Espresso Lane', postal: '520123' }],
        planning_area: 'TAMPINES',
      },
      error: null,
    })
    await user.click(screen.getByRole('button', { name: 'Change address' }))
    await user.type(screen.getByLabelText('Postal code'), '520123')
    expect(await screen.findByText('5 Espresso Lane')).toBeInTheDocument()

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload).toMatchObject({
      area: 'Tampines',
      full_address: '5 Espresso Lane',
    })
  })

  it('saves a newly picked address with a unit', async () => {
    const { user } = await renderLoaded({ section: 'location' })
    supabase.functions.invoke.mockResolvedValue({
      data: {
        results: [{ address: '5 ESPRESSO LANE SINGAPORE 520123', postal: '520123' }],
        planning_area: 'TAMPINES',
      },
      error: null,
    })
    await user.click(screen.getByRole('button', { name: 'Change address' }))
    expect(screen.queryByLabelText('Unit number (optional)')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Postal code'), '520123')
    expect(await screen.findByText('5 ESPRESSO LANE SINGAPORE 520123')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Unit number (optional)'), '#05-12')
    expect(screen.getByText('5 ESPRESSO LANE #05-12 SINGAPORE 520123')).toBeInTheDocument()

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload).toMatchObject({
      full_address: '5 ESPRESSO LANE #05-12 SINGAPORE 520123',
    })
  })

  it('writes listing spots onto future sessions and stays on the section', async () => {
    givenFoundingHost(false, null, {
      updated: 2,
      held: [
        {
          session_id: 's-held',
          starts_at: '2099-06-10T02:00:00.000Z',
          spots_total: 5,
          booked: 5,
        },
      ],
    })
    const { user, currentPath, currentSearch } = await renderLoaded({ section: 'price' })
    await user.click(screen.getByRole('button', { name: 'More spots' }))

    await user.click(saveButton())

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('set_listing_spots', {
        p_listing_id: 'listing-1',
        p_spots: 5,
      })
    )
    await waitFor(() => expect(saveStatus()).toHaveTextContent(/^Saved\. Updated 2 future sessions\./))
    expect(saveStatus()).toHaveTextContent(/kept 5 spots because of existing bookings/)
    // Spots go through set_listing_spots alone; nothing else on the row changed.
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
    expect(currentPath()).toBe('/edit-listing/listing-1')
    expect(currentSearch()).toBe('?section=price')
    expect(saveButton()).toBeDisabled()
    expect(sectionLink('Price and time')).toHaveTextContent('5 spots')
    // A fix to a listing the team sent back goes straight back to them.
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'listing-submitted',
      expect.objectContaining({ body: {} })
    )
  })

  it('updates the page title once a new title is saved', async () => {
    const { user } = await renderLoaded({ section: 'basics' })
    await editTitle(user, 'Latte art two')
    await user.click(saveButton())

    await waitFor(() => expect(saveStatus()).toHaveTextContent(/^Saved\./))
    expect(document.querySelector('.edit-head__title')).toHaveTextContent('Latte art two')
  })

  it('stays on the form when set_listing_spots fails', async () => {
    supabase.rpc.mockImplementation(async (fn) => {
      if (fn === 'my_is_founding_host') return { data: false, error: null }
      if (fn === 'listing_address') return { data: '12 Coffee Road', error: null }
      if (fn === 'set_listing_spots') {
        return { data: null, error: { message: 'Spots per session must be at least 1.' } }
      }
      return { data: null, error: null }
    })
    const { user, currentPath } = await renderLoaded()
    await editTitle(user)

    await user.click(saveButton())

    expect(await screen.findByText('Spots per session must be at least 1.')).toBeInTheDocument()
    expect(currentPath()).toBe('/edit-listing/listing-1')
  })

  it('saves the listing before set_listing_spots rewrites the row', async () => {
    // set_listing_spots updates max_guests on this same row, so the database
    // re-checks the price. Run first, it hit the old over-ceiling price the
    // host was correcting in this very save.
    let updatesBeforeSpots = null
    supabase.rpc.mockImplementation(async (fn) => {
      if (fn === 'my_is_founding_host') return { data: false, error: null }
      if (fn === 'listing_address') return { data: '12 Coffee Road', error: null }
      if (fn === 'set_listing_spots') {
        updatesBeforeSpots = supabase.__calls('listings', 'update').length
        return { data: { updated: 0, held: [] }, error: null }
      }
      return { data: null, error: null }
    })
    const { user } = await renderLoaded()
    await editTitle(user)

    await user.click(saveButton())

    await waitFor(() => expect(saveStatus()).toHaveTextContent(/^Saved\./))
    expect(updatesBeforeSpots).toBe(1)
  })

  it('does not set spots when the listing update is refused', async () => {
    supabase.__on('listings', 'update', { error: { message: 'row level security' } })
    const { user } = await renderLoaded()
    await editTitle(user)

    await user.click(saveButton())

    expect(await screen.findByText(LISTING_SAVE_ERROR)).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalledWith('set_listing_spots', expect.anything())
  })

  it('reports a rejected update in plain words and stays put', async () => {
    supabase.__on('listings', 'update', {
      error: { message: 'new row violates row-level security policy for table "listings"' },
    })
    const { user, currentPath } = await renderLoaded()
    await editTitle(user)

    await user.click(saveButton())

    expect(await screen.findByText(LISTING_SAVE_ERROR)).toBeInTheDocument()
    expect(screen.queryByText(/row-level security/)).not.toBeInTheDocument()
    expect(currentPath()).toBe('/edit-listing/listing-1')
    expect(saveButton()).toBeEnabled()
  })

  it('opens the price and points at it instead of quoting the price ceiling check', async () => {
    supabase.__on('listings', 'update', {
      error: {
        message: 'new row for relation "listings" violates check constraint "listings_price_ceiling"',
      },
    })
    const { user, currentSearch } = await renderLoaded({ section: 'basics' })
    await editTitle(user)

    await user.click(saveButton())

    expect(await screen.findByText('Check the price above.')).toBeInTheDocument()
    await waitFor(() => expect(currentSearch()).toBe('?section=price'))
    expect(screen.getByText(LISTING_FIELD_HINTS.price)).toBeInTheDocument()
    expect(screen.queryByText(/listings_price_ceiling/)).not.toBeInTheDocument()
  })

  it('saves an empty provided list when "None" is selected', async () => {
    const { user } = await renderLoaded({ section: 'provided' })
    await user.click(screen.getByRole('checkbox', { name: 'None' }))

    expect(screen.getByRole('checkbox', { name: 'Materials' })).toBeDisabled()
    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.whats_provided).toEqual([])
  })

  it('saves a custom provided item', async () => {
    const { user } = await renderLoaded({ section: 'provided' })
    await user.type(screen.getByLabelText('Add your own'), 'Apron')
    await user.click(screen.getByRole('button', { name: '+ Add your own' }))

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.whats_provided).toEqual([
      'Materials',
      'Apron',
    ])
  })

  it('toggles a provided option back off', async () => {
    const { user } = await renderLoaded({ section: 'provided' })
    await user.click(screen.getByRole('checkbox', { name: 'Materials' }))

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.whats_provided).toEqual([])
  })
})

describe('EditListing what guests should bring', () => {
  it('saves a suggestion and a custom item, and caps the list at five', async () => {
    givenListing({ what_to_bring: [] })
    const { user } = await renderLoaded({ section: 'bring' })
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Comfortable clothes' }))
    // A picked suggestion moves up to "Guests bring".
    expect(screen.queryByRole('button', { name: 'Comfortable clothes' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Comfortable clothes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Water bottle' }))
    await user.click(screen.getByRole('button', { name: 'Notebook and pen' }))
    await user.type(screen.getByLabelText('Add something to bring'), 'Yoga mat')
    await user.click(screen.getByRole('button', { name: '+ Add item' }))
    await user.type(screen.getByLabelText('Add something to bring'), 'Towel')
    await user.click(screen.getByRole('button', { name: '+ Add item' }))

    expect(screen.getByText('Up to 5 items.')).toBeInTheDocument()
    expect(screen.queryByText('Suggestions · tap to add')).not.toBeInTheDocument()

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.what_to_bring).toEqual([
      'Comfortable clothes',
      'Water bottle',
      'Notebook and pen',
      'Yoga mat',
      'Towel',
    ])
  })

  it('keeps a typed item to 40 characters', async () => {
    givenListing({ what_to_bring: [] })
    const { user } = await renderLoaded({ section: 'bring' })
    await user.type(screen.getByLabelText('Add something to bring'), `${'x'.repeat(41)}extra`)
    await user.click(screen.getByRole('button', { name: '+ Add item' }))

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.what_to_bring).toEqual(['x'.repeat(40)])
  })

  it('clears saved items when the host chooses nothing', async () => {
    givenListing({ what_to_bring: ['Water bottle'] })
    const { user } = await renderLoaded({ section: 'bring' })
    expect(screen.getByLabelText('Remove Water bottle')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Nothing, we provide everything' }))
    expect(screen.getByText('Nothing, you provide everything.')).toBeInTheDocument()

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.what_to_bring).toEqual([])
  })
})

describe('EditListing photos', () => {
  function selectFiles(files) {
    fireEvent.change(screen.getByLabelText('Photos', { selector: 'input' }), { target: { files } })
  }

  async function removePhoto(user, label) {
    await user.click(screen.getByRole('button', { name: label }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))
  }

  it('keeps the existing photos and appends the newly uploaded ones', async () => {
    const { user } = await renderLoaded({ section: 'photos' })
    selectFiles([imageFile('two.png')])
    await screen.findByText('2 of 8')

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    const { photo_urls: photoUrls } = supabase.__lastCall('listings', 'update').payload
    expect(photoUrls[0]).toBe('https://cdn.test/one.jpg')
    expect(photoUrls[1]).toMatch(/^https:\/\/cdn\.test\/listing-photos\/host-9\/.+\.png$/)
  })

  it('sends only the photos when only the photos changed', async () => {
    // A tab opened before the host fixed the title must not put the old title
    // back when it saves new photos.
    const { user } = await renderLoaded({ section: 'photos' })
    selectFiles([imageFile('two.png')])
    await screen.findByText('2 of 8')

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    const { payload } = supabase.__lastCall('listings', 'update')
    expect(Object.keys(payload)).toEqual(['photo_urls'])
  })

  it('does not upload a photo again on the next save', async () => {
    const { user } = await renderLoaded({ section: 'photos' })
    selectFiles([imageFile('two.png')])
    await screen.findByText('2 of 8')
    await user.click(saveButton())
    await waitFor(() => expect(saveStatus()).toHaveTextContent(/^Saved\./))
    const uploads = supabase.__bucket('listing-photos').upload.mock.calls.length

    await user.click(sectionLink('The basics'))
    await editTitle(user)
    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(2))
    expect(supabase.__bucket('listing-photos').upload.mock.calls.length).toBe(uploads)
    // The photos are already saved, so the second save leaves them alone.
    expect(supabase.__lastCall('listings', 'update').payload).not.toHaveProperty('photo_urls')
  })

  it('removes a photo from its ⋯ menu, not a quick ×', async () => {
    givenListing({ photo_urls: ['https://cdn.test/one.jpg', 'https://cdn.test/two.jpg'] })
    const { user } = await renderLoaded({ section: 'photos' })
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument()

    await removePhoto(user, 'Photo 1 (cover)')

    expect(screen.getByText('1 of 8')).toBeInTheDocument()
  })

  it('treats removing a photo as dirty and asks before leaving', async () => {
    givenListing({ photo_urls: ['https://cdn.test/one.jpg', 'https://cdn.test/two.jpg'] })
    const { user } = await renderLoaded({
      section: 'photos',
      withNav: true,
      extraRoutes: <Route path="/" element={<h1>Home</h1>} />,
    })

    await removePhoto(user, 'Photo 1 (cover)')
    await user.click(screen.getByRole('link', { name: 'TryKai home' }))

    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByText('1 of 8')).toBeInTheDocument()
  })

  it('drops a removed photo from the saved listing', async () => {
    givenListing({ photo_urls: ['https://cdn.test/one.jpg', 'https://cdn.test/two.jpg'] })
    const { user } = await renderLoaded({ section: 'photos' })
    await removePhoto(user, 'Photo 1 (cover)')

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.photo_urls).toEqual([
      'https://cdn.test/two.jpg',
    ])
  })

  it('lets a newly added photo be removed again', async () => {
    const { user } = await renderLoaded({ section: 'photos' })
    selectFiles([imageFile('two.png')])
    await screen.findByText('2 of 8')

    await removePhoto(user, 'Photo 2')

    expect(screen.getByText('1 of 8')).toBeInTheDocument()
  })

  it('opens the picker from an empty shot tile', async () => {
    await renderLoaded({ section: 'photos' })
    const picker = screen.getByLabelText('Photos', { selector: 'input' })
    const click = vi.spyOn(picker, 'click')

    fireEvent.click(screen.getByRole('button', { name: /^You teaching/ }))

    expect(click).toHaveBeenCalled()
  })

  it('ignores files that are not images', async () => {
    await renderLoaded({ section: 'photos' })

    selectFiles([new File(['x'], 'notes.txt', { type: 'text/plain' })])

    expect(screen.getByText('1 of 8')).toBeInTheDocument()
  })

  it('counts existing photos towards the eight photo cap', async () => {
    givenListing({
      photo_urls: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => `https://cdn.test/${name}.jpg`),
    })
    await renderLoaded({ section: 'photos' })
    expect(screen.getByRole('button', { name: /^Add another/ })).toBeInTheDocument()

    selectFiles([imageFile('h.png'), imageFile('i.png')])

    expect(await screen.findByText('8 of 8')).toBeInTheDocument()
    expect(screen.getByLabelText('Photos', { selector: 'input' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Add another/ })).not.toBeInTheDocument()
  })

  it('asks before saving once the last photo is removed, then lets the host skip', async () => {
    const { user } = await renderLoaded({ section: 'photos' })
    await removePhoto(user, 'Photo 1 (cover)')

    await user.click(saveButton())

    expect(
      screen.getByText('Your skill deserves to be seen! Listings with photos get far more bookings.'),
    ).toBeInTheDocument()
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Skip for now' }))

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.photo_urls).toEqual([])
  })

  it('does not ask about photos when saving a listing that never had any', async () => {
    givenListing({ photo_urls: [] })
    const { user } = await renderLoaded()
    await editTitle(user)

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(screen.queryByText(/Your skill deserves to be seen/)).not.toBeInTheDocument()
  })

  it('abandons the save when a photo fails to upload', async () => {
    const { user } = await renderLoaded({ section: 'photos' })
    selectFiles([imageFile('two.png')])
    await screen.findByText('2 of 8')
    supabase
      .__bucket('listing-photos')
      .upload.mockResolvedValue({ data: null, error: { message: 'storage full' } })

    await user.click(saveButton())

    expect(await screen.findByText(PHOTO_UPLOAD_ERROR)).toBeInTheDocument()
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })
})

describe('EditListing delete', () => {
  function givenDeleteListing(result = { data: 'listing-1', error: null }) {
    const previous = supabase.rpc.getMockImplementation()
    supabase.rpc.mockImplementation(async (fn, args) => {
      if (fn === 'delete_listing') return typeof result === 'function' ? result(args) : result
      if (previous) return previous(fn, args)
      return { data: null, error: null }
    })
  }

  const hostingRoute = <Route path="/hosting" element={<h1>Hosting</h1>} />

  it('sits under Listing status, away from the save button', async () => {
    await renderLoaded()
    const remove = screen.getByRole('button', { name: 'Delete listing' })
    expect(remove.closest('.edit-danger')).toBeInTheDocument()
    expect(remove.closest('form')).toBeNull()
  })

  it('deletes through delete_listing and goes to Hosting', async () => {
    givenDeleteListing()
    const { user, currentPath } = await renderLoaded({ extraRoutes: hostingRoute })

    await user.click(screen.getByRole('button', { name: 'Delete listing' }))
    expect(screen.getByRole('dialog')).toHaveTextContent("Delete 'Latte art'? This can't be undone.")
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('delete_listing', { p_listing_id: 'listing-1' }),
    )
    await waitFor(() => expect(currentPath()).toBe('/hosting'))
    expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).not.toBeInTheDocument()
  })

  it('blocks delete when an upcoming session has a booking', async () => {
    supabase.__on('sessions', 'select', {
      data: [
        {
          id: 's-booked',
          listing_id: 'listing-1',
          starts_at: '2099-06-10T02:00:00.000Z',
          bookings: [{ id: 'b1', status: 'confirmed', guests_count: 1 }],
        },
      ],
      error: null,
    })
    const { user } = await renderLoaded()

    await user.click(screen.getByRole('button', { name: 'Delete listing' }))

    expect(screen.getByRole('dialog')).toHaveTextContent(
      "'Latte art' has 1 upcoming booking. Cancel those sessions first. Guests are refunded in full.",
    )
    expect(screen.queryByRole('button', { name: 'Confirm delete' })).not.toBeInTheDocument()
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'delete_listing')).toBe(false)
  })

  it('does not ask about unsaved changes after a delete with dirty edits', async () => {
    givenDeleteListing()
    const { user, currentPath } = await renderLoaded({ extraRoutes: hostingRoute })

    await editTitle(user, 'New title')
    await user.click(screen.getByRole('button', { name: 'Delete listing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => expect(currentPath()).toBe('/hosting'))
    expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).not.toBeInTheDocument()
  })

  it('maps an active-bookings RPC error to a cancel-those-sessions line', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    givenDeleteListing({ data: null, error: { message: 'listing has active bookings' } })
    const { user, currentPath } = await renderLoaded()

    await user.click(screen.getByRole('button', { name: 'Delete listing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(LISTING_DELETE_ACTIVE_BOOKINGS)
    expect(log).toHaveBeenCalledWith(
      'Listing delete failed',
      expect.objectContaining({ message: 'listing has active bookings' }),
    )
    expect(screen.getByRole('navigation', { name: 'Listing sections' })).toBeInTheDocument()
    expect(currentPath()).toBe('/edit-listing/listing-1')
    log.mockRestore()
  })

  it('keeps the form and shows a retry line when delete fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    givenDeleteListing({ data: null, error: { message: 'not your listing' } })
    const { user, currentPath } = await renderLoaded()

    await user.click(screen.getByRole('button', { name: 'Delete listing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(LISTING_DELETE_FAILED)
    expect(log).toHaveBeenCalledWith(
      'Listing delete failed',
      expect.objectContaining({ message: 'not your listing' }),
    )
    expect(screen.getByRole('navigation', { name: 'Listing sections' })).toBeInTheDocument()
    expect(currentPath()).toBe('/edit-listing/listing-1')
    log.mockRestore()
  })

  it('hides Confirm when the sessions query fails', async () => {
    supabase.__on('sessions', 'select', { data: null, error: { message: 'permission denied' } })
    const { user } = await renderLoaded()

    await user.click(screen.getByRole('button', { name: 'Delete listing' }))

    expect(screen.getByRole('dialog')).toHaveTextContent(LISTING_DELETE_SESSIONS_UNAVAILABLE)
    expect(screen.queryByRole('button', { name: 'Confirm delete' })).not.toBeInTheDocument()
    expect(supabase.rpc.mock.calls.some(([name]) => name === 'delete_listing')).toBe(false)
  })
})

describe('EditListing add-ons', () => {
  function givenAddons(rows) {
    supabase.__on('listing_addons', 'select', { data: rows, error: null })
  }

  const kit = {
    id: 'addon-keep',
    name: 'Kit',
    description: '',
    price_cents: 1000,
    unit: 'person',
    session_limit: null,
    photo_url: null,
    position: 0,
    is_active: true,
  }
  const wrap = {
    id: 'addon-drop',
    name: 'Wrap',
    description: '',
    price_cents: 500,
    unit: 'booking',
    session_limit: null,
    photo_url: null,
    position: 1,
    is_active: true,
  }

  it('sums up the add-ons on the overview', async () => {
    givenAddons([kit, wrap])
    await renderLoaded()
    expect(sectionLink('Add-ons')).toHaveTextContent('2 add-ons · Kit, Wrap')
  })

  it('inserts, updates and soft-deletes add-ons on save', async () => {
    givenAddons([kit, wrap])
    const { user } = await renderLoaded({ section: 'addons' })
    expect(await screen.findByRole('heading', { name: 'Add-ons · optional' })).toBeInTheDocument()

    expect(screen.getByText(/^You get S\$10 per guest · guests pay S\$\d+$/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Kit' }))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Premium kit')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Remove Wrap' }))
    await user.click(screen.getByRole('button', { name: 'Add an add-on' }))
    await user.click(screen.getByRole('button', { name: 'Write my own' }))
    await user.type(screen.getByLabelText('Name'), 'Drinks')
    await user.type(screen.getByLabelText('You get in Singapore dollars'), '8')

    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listing_addons', 'update').length).toBeGreaterThan(0))
    const updates = supabase.__calls('listing_addons', 'update')
    expect(updates.some((call) => call.payload.is_active === false && call.filters.some((f) => f.value === 'addon-drop'))).toBe(true)
    expect(updates.some((call) => call.payload.name === 'Premium kit')).toBe(true)
    expect(supabase.__lastCall('listing_addons', 'insert').payload).toMatchObject({
      listing_id: 'listing-1',
      name: 'Drinks',
      price_cents: 800,
    })
  })

  it('does not insert an add-on twice when a save fails part way and is retried', async () => {
    givenAddons([])
    let inserts = 0
    supabase.__on('listing_addons', 'insert', () => {
      inserts += 1
      if (inserts === 2) return { data: null, error: { code: '23514', message: 'boom' } }
      return { data: { id: `addon-new-${inserts}` }, error: null }
    })
    const { user } = await renderLoaded({ section: 'addons' })
    await screen.findByRole('heading', { name: 'Add-ons · optional' })
    async function addOwn(name, price) {
      await user.click(screen.getByRole('button', { name: 'Add an add-on' }))
      await user.click(screen.getByRole('button', { name: 'Write my own' }))
      await user.type(screen.getByLabelText('Name'), name)
      await user.type(screen.getByLabelText('You get in Singapore dollars'), price)
      await user.click(screen.getByRole('button', { name: 'Done' }))
    }
    await addOwn('Kit', '10')
    await addOwn('Wrap', '5')

    await user.click(saveButton())
    await waitFor(() => expect(inserts).toBe(2))
    await waitFor(() => expect(saveButton()).toBeEnabled())

    await user.click(saveButton())
    await waitFor(() => expect(inserts).toBe(3))
    const names = supabase.__calls('listing_addons', 'insert').map((call) => call.payload.name)
    expect(names).toEqual(['Kit', 'Wrap', 'Wrap'])
    expect(
      supabase
        .__calls('listing_addons', 'update')
        .some((call) => call.payload.name === 'Kit' && call.filters.some((f) => f.value === 'addon-new-1')),
    ).toBe(true)
  })

  it('updates rather than inserts an add-on saved earlier on the page', async () => {
    givenAddons([])
    supabase.__on('listing_addons', 'insert', { data: { id: 'addon-new' }, error: null })
    const { user } = await renderLoaded({ section: 'addons' })
    await user.click(screen.getByRole('button', { name: 'Add an add-on' }))
    await user.click(screen.getByRole('button', { name: 'Write my own' }))
    await user.type(screen.getByLabelText('Name'), 'Kit')
    await user.type(screen.getByLabelText('You get in Singapore dollars'), '10')
    await user.click(saveButton())
    await waitFor(() => expect(saveStatus()).toHaveTextContent(/^Saved\./))

    // The card the host was writing in stays open after the save.
    await user.type(screen.getByLabelText('Name'), ' two')
    await user.click(saveButton())

    await waitFor(() =>
      expect(
        supabase
          .__calls('listing_addons', 'update')
          .some((call) => call.payload.name === 'Kit two' && call.filters.some((f) => f.value === 'addon-new')),
      ).toBe(true),
    )
    expect(supabase.__calls('listing_addons', 'insert')).toHaveLength(1)
  })

  it('treats an add-on edit as unsaved', async () => {
    givenAddons([kit])
    const { user } = await renderLoaded({
      section: 'addons',
      withNav: true,
      extraRoutes: <Route path="/" element={<h1>Home</h1>} />,
    })
    await user.click(await screen.findByRole('button', { name: 'Edit Kit' }))
    await user.type(screen.getByLabelText('Name'), ' extra')
    await user.click(screen.getByRole('link', { name: 'TryKai home' }))
    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument()
  })

  it('hides add-ons when the table is missing and still saves the listing', async () => {
    supabase.__on('listing_addons', 'select', {
      data: null,
      error: { code: '42P01', message: 'relation "public.listing_addons" does not exist' },
    })
    const { user } = await renderLoaded()
    expect(screen.queryByRole('heading', { name: 'Add-ons · optional' })).not.toBeInTheDocument()

    await editTitle(user)
    await user.click(saveButton())

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__calls('listing_addons', 'insert')).toHaveLength(0)
    expect(supabase.__calls('listing_addons', 'update')).toHaveLength(0)
  })
})
