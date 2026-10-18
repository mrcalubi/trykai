import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateListing from './CreateListing'
import RequireAuth from '../components/RequireAuth'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'
import { LISTING_FIELD_HINTS, PHOTO_UPLOAD_ERROR } from '../lib/listingFieldHints'

vi.mock('../lib/supabase')

function givenSignedIn(userId = 'host-1') {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: userId } }) },
    error: null,
  })
}

function givenVerification(status, { foundingHost = false, foundingError = null } = {}) {
  supabase.rpc.mockImplementation(async (fn) => {
    if (fn === 'my_verification') {
      return { data: [{ verification_status: status }], error: null }
    }
    if (fn === 'my_is_founding_host') {
      return foundingError
        ? { data: null, error: foundingError }
        : { data: foundingHost, error: null }
    }
    return { data: null, error: null }
  })
}

// Mounted behind the same guard App.jsx puts it behind, so the page always has
// a signed-in user. RequireAuth owns the signed-out case and tests it itself.
function renderPage() {
  return renderWithRouter(
    <RequireAuth>
      <CreateListing />
    </RequireAuth>,
    { route: '/create-listing', path: '/create-listing' }
  )
}

const DURATION_LABELS = { 60: '1 hr', 90: '1.5 hr', 120: '2 hr' }

function stepHeading(name) {
  return screen.findByRole('heading', { level: 1, name })
}

async function next(user) {
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

async function skipEmptyPhotos(user) {
  await user.click(await screen.findByRole('button', { name: 'Skip for now' }))
}

async function completeBasics(user, values) {
  await user.clear(screen.getByLabelText('Title'))
  if (values.title) await user.type(screen.getByLabelText('Title'), values.title)
  if (values.category) await user.click(screen.getByRole('radio', { name: values.category }))
  if (values.description) await user.type(screen.getByLabelText('Description'), values.description)
  await next(user)
}

async function setGroupSize(user, target) {
  const count = () => Number(document.querySelector('.guest-stepper__count').textContent)
  while (count() < target) await user.click(screen.getByRole('button', { name: 'More guests' }))
  while (count() > target && count() > 1) {
    await user.click(screen.getByRole('button', { name: 'Fewer guests' }))
  }
}

async function completePrice(user, values) {
  if (values.price) await user.type(screen.getByLabelText('Your price per guest'), values.price)
  await setGroupSize(user, values.maxGuests)
  const preset = DURATION_LABELS[values.duration]
  if (preset) {
    await user.click(screen.getByRole('radio', { name: preset }))
  } else if (values.duration != null) {
    await user.click(screen.getByRole('radio', { name: 'Other' }))
    await user.type(screen.getByLabelText('Minutes'), String(values.duration))
  }
  if (values.groupPricing === false) {
    await user.click(screen.getByRole('checkbox', { name: /Offer group discounts/ }))
  }
  await next(user)
}

async function choosePlanningArea(user, name) {
  const input = screen.getByLabelText('Area')
  await user.clear(input)
  await user.type(input, name)
  await user.click(screen.getByRole('option', { name }))
}

async function completeLocation(user, values) {
  await choosePlanningArea(user, values.area)
  // The address label also wraps a hint span, so it needs a partial match.
  if (values.fullAddress) await user.type(screen.getByLabelText(/^Full address/), values.fullAddress)
  await next(user)
}

const VALID = {
  title: 'Learn latte art with me',
  description: 'Pull your first rosetta.',
  category: 'Food',
  price: '45',
  maxGuests: 4,
  duration: 90,
  area: 'Bedok',
  fullAddress: '12 Coffee Road',
}

/** Walks every step with valid answers and stops on the final step, terms agreed. */
async function fillValidForm(user, overrides = {}) {
  const values = { ...VALID, ...overrides }
  await stepHeading('The basics')
  await completeBasics(user, values)
  await stepHeading('Add photos')
  await next(user)
  await skipEmptyPhotos(user)
  await stepHeading('Price and group size')
  await completePrice(user, values)
  await stepHeading('Where it happens')
  await completeLocation(user, values)
  await stepHeading('Final touches')
  await user.click(screen.getByRole('checkbox', { name: /I agree to the Host terms/ }))
  return values
}

async function goToPhotos(user) {
  await stepHeading('The basics')
  await completeBasics(user, VALID)
  await stepHeading('Add photos')
}

async function goToPrice(user) {
  await goToPhotos(user)
  await next(user)
  await skipEmptyPhotos(user)
  await stepHeading('Price and group size')
}

function imageFile(name = 'photo.png') {
  return new File(['binary'], name, { type: 'image/png' })
}

// Node's own experimental localStorage hides jsdom's, so drafts get a plain
// in-memory store of their own.
function memoryStorage() {
  const items = new Map()
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
    clear: () => items.clear(),
  }
}

beforeEach(() => {
  supabase.__reset()
  Object.defineProperty(window, 'localStorage', {
    value: memoryStorage(),
    configurable: true,
  })
})

describe('CreateListing access control', () => {
  it('sends unverified hosts to identity verification with an explanation', async () => {
    givenSignedIn()
    givenVerification('unverified')
    const { currentPath, currentState } = renderPage()

    await waitFor(() => expect(currentPath()).toBe('/verify-identity'))
    expect(currentState().message).toBe(
      'You need to verify your identity before you can host on TryKai.'
    )
  })

  it('sends rejected hosts back to verification', async () => {
    givenSignedIn()
    givenVerification('rejected')
    const { currentPath } = renderPage()

    await waitFor(() => expect(currentPath()).toBe('/verify-identity'))
  })

  it('treats a missing verification record as unverified', async () => {
    givenSignedIn()
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    const { currentPath } = renderPage()

    await waitFor(() => expect(currentPath()).toBe('/verify-identity'))
  })

  it('sends pending hosts to the verification status page', async () => {
    givenSignedIn()
    givenVerification('pending')
    const { currentPath } = renderPage()

    await waitFor(() => expect(currentPath()).toBe('/verify-identity'))
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
  })

  it('shows the form to an approved host', async () => {
    givenSignedIn()
    givenVerification('approved')
    renderPage()

    expect(await screen.findByLabelText('Title')).toBeInTheDocument()
  })

  it('still shows the form when founding-host status cannot be read', async () => {
    givenSignedIn()
    givenVerification('approved', {
      foundingError: { message: 'permission denied for column is_founding_host' },
    })
    renderPage()

    expect(await screen.findByLabelText('Title')).toBeInTheDocument()
  })
})

describe('CreateListing steps', () => {
  beforeEach(() => {
    givenSignedIn()
    givenVerification('approved')
  })

  it('starts on step 1 of 5 and names the next step', async () => {
    renderPage()

    await stepHeading('The basics')
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument()
    expect(screen.getByText('Next: Photos')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Listing progress' })).toHaveAttribute(
      'aria-valuenow',
      '1'
    )
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute('href', '/hosting')
  })

  it('reaches the price step as step 3 with Location next, like the mockup', async () => {
    const { user } = renderPage()
    await goToPrice(user)

    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument()
    expect(screen.getByText('Next: Location')).toBeInTheDocument()
  })

  it('goes back a step and keeps what was typed', async () => {
    const { user } = renderPage()
    await goToPhotos(user)

    await user.click(screen.getByRole('button', { name: 'Back' }))

    await stepHeading('The basics')
    expect(screen.getByLabelText('Title')).toHaveValue('Learn latte art with me')
    expect(screen.getByRole('radio', { name: 'Food' })).toBeChecked()
  })
})

describe('CreateListing validation', () => {
  beforeEach(() => {
    givenSignedIn()
    givenVerification('approved')
  })

  it('rejects a title that is only whitespace', async () => {
    const { user } = renderPage()
    await stepHeading('The basics')

    await completeBasics(user, { ...VALID, title: '   ' })

    expect(await screen.findByText(LISTING_FIELD_HINTS.title)).toBeInTheDocument()
    expect(document.querySelector('.error-message')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'The basics' })).toBeInTheDocument()
  })

  it('asks for a description in the same warm tone', async () => {
    const { user } = renderPage()
    await stepHeading('The basics')

    await completeBasics(user, { ...VALID, description: '' })

    expect(await screen.findByText(LISTING_FIELD_HINTS.description)).toBeInTheDocument()
    expect(document.querySelector('.error-message')).not.toBeInTheDocument()
  })

  it('asks for a category before moving on', async () => {
    const { user } = renderPage()
    await stepHeading('The basics')

    await completeBasics(user, { ...VALID, category: null })

    expect(await screen.findByText(LISTING_FIELD_HINTS.category)).toBeInTheDocument()
  })

  it('rejects a price of zero', async () => {
    const { user } = renderPage()
    await goToPrice(user)

    await completePrice(user, { ...VALID, price: '0' })

    expect(await screen.findByText(LISTING_FIELD_HINTS.price)).toBeInTheDocument()
  })

  it('asks how long each session lasts', async () => {
    const { user } = renderPage()
    await goToPrice(user)

    await completePrice(user, { ...VALID, duration: null })

    expect(await screen.findByText(LISTING_FIELD_HINTS.duration)).toBeInTheDocument()
  })

  it('rejects a custom duration below one minute', async () => {
    const { user } = renderPage()
    await goToPrice(user)

    await completePrice(user, { ...VALID, duration: 0 })

    expect(await screen.findByText(LISTING_FIELD_HINTS.duration)).toBeInTheDocument()
  })

  it('never lets the group size drop below one', async () => {
    const { user } = renderPage()
    await goToPrice(user)

    await setGroupSize(user, 1)

    expect(screen.getByText('Spots per session')).toBeInTheDocument()
    expect(document.querySelector('.guest-stepper__count')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Fewer guests' })).toBeDisabled()
  })

  it('rejects a blank address', async () => {
    const { user } = renderPage()
    await goToPrice(user)
    await completePrice(user, VALID)
    await stepHeading('Where it happens')

    await completeLocation(user, { ...VALID, fullAddress: '  ' })

    expect(await screen.findByText(LISTING_FIELD_HINTS.fullAddress)).toBeInTheDocument()
  })

  it('keeps Create listing disabled until the host agrees to the Host terms', async () => {
    const { user } = renderPage()
    await fillValidForm(user)
    await user.click(screen.getByRole('checkbox', { name: /I agree to the Host terms/ }))

    expect(screen.getByRole('button', { name: 'Create listing' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Host terms' })).toHaveAttribute(
      'href',
      '/terms#part-2-hosting',
    )

    await user.click(screen.getByRole('checkbox', { name: /I agree to the Host terms/ }))
    expect(screen.getByRole('button', { name: 'Create listing' })).toBeEnabled()
  })
})

describe('CreateListing price panel', () => {
  it('stays hidden until a price is entered', async () => {
    givenSignedIn()
    givenVerification('approved')
    const { user } = renderPage()
    await goToPrice(user)

    expect(screen.queryByText('Guests pay')).not.toBeInTheDocument()
  })

  it('shows what guests pay, the host cut, the fee after three bookings and a full session', async () => {
    givenSignedIn()
    givenVerification('approved')
    const { user } = renderPage()
    await goToPrice(user)

    await user.type(screen.getByLabelText('Your price per guest'), '25')

    expect(screen.getByText('Guests pay').closest('.price-panel__figure')).toHaveTextContent('$28')
    expect(screen.getByText('You get').closest('.price-panel__figure')).toHaveTextContent('$25')
    expect(screen.getByText(/Full session of 4/)).toHaveTextContent('Full session of 4: $100')
    expect(screen.getByText(/Full session of 4/)).not.toHaveTextContent('up to')
    expect(screen.getByText('10% host fee from your 4th booking.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Group discounts come off your price, e.g. a group of 4 together pays you $85 instead of $100.',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'How these numbers work' }))
    expect(screen.getByText('2 guests: 5% off the lesson')).toBeInTheDocument()
    expect(screen.getByText(/One group of 4: \$85 before any host fee/)).toBeInTheDocument()
    expect(
      screen.getByText(/After the 10% host fee \(from your 4th booking\): \$22.50 per person/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More guests' }))
    expect(screen.getByText(/Full session of 5/)).toHaveTextContent('Full session of 5: $125')
    expect(
      screen.getByText(
        'Group discounts come off your price, e.g. a group of 5 together pays you $100 instead of $125.',
      ),
    ).toBeInTheDocument()
  })

  it('shows one full-session number when group discounts are off', async () => {
    givenSignedIn()
    givenVerification('approved')
    const { user } = renderPage()
    await goToPrice(user)

    await user.type(screen.getByLabelText('Your price per guest'), '25')
    await user.click(screen.getByRole('checkbox', { name: /Offer group discounts/ }))

    expect(screen.getByText(/Full session of 4/)).toHaveTextContent('Full session of 4: $100')
    expect(
      screen.queryByText(/Group discounts come off your price/),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'How these numbers work' }))
    expect(
      screen.getByText('Group discounts are off. Guests pay the same per person at every group size.'),
    ).toBeInTheDocument()
  })

  it('omits the host fee for a founding host', async () => {
    givenSignedIn()
    givenVerification('approved', { foundingHost: true })
    const { user } = renderPage()
    await goToPrice(user)

    await user.type(screen.getByLabelText('Your price per guest'), '25')

    expect(screen.getByText('You get')).toBeInTheDocument()
    expect(screen.getByText('Founding host: no host fee, ever.')).toBeInTheDocument()
    expect(screen.queryByText('10% host fee from your 4th booking.')).not.toBeInTheDocument()
  })

  it('shows only the guest price when founding-host status is unknown', async () => {
    givenSignedIn()
    givenVerification('approved', {
      foundingError: { message: 'function my_is_founding_host does not exist' },
    })
    const { user } = renderPage()
    await goToPrice(user)

    await user.type(screen.getByLabelText('Your price per guest'), '25')

    expect(screen.getByText('Guests pay')).toBeInTheDocument()
    expect(screen.queryByText('You get')).not.toBeInTheDocument()
    expect(screen.queryByText(/host fee/)).not.toBeInTheDocument()
  })
})

describe('CreateListing submission', () => {
  beforeEach(() => {
    givenSignedIn('host-9')
    givenVerification('approved')
  })

  it('stores the price in cents and trims the free-text fields', async () => {
    const { user } = renderPage()
    await fillValidForm(user, { title: 'Latte art  ', price: '45.50' })

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'insert').payload).toMatchObject({
      host_id: 'host-9',
      title: 'Latte art',
      category: 'Food',
      price_per_person: 4550,
      max_guests: 4,
      duration_mins: 90,
      group_pricing: true,
      area: 'Bedok',
      full_address: '12 Coffee Road',
      is_active: true,
    })
  })

  it('rounds a fractional cent price to the nearest cent', async () => {
    const { user } = renderPage()
    await fillValidForm(user, { price: '19.99' })

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'insert').payload.price_per_person).toBe(1999)
  })

  it('saves the chosen group size and a custom duration', async () => {
    const { user } = renderPage()
    await fillValidForm(user, { maxGuests: 6, duration: 45 })

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'insert').payload).toMatchObject({
      max_guests: 6,
      duration_mins: 45,
    })
  })

  it('lets the host turn group pricing off', async () => {
    const { user } = renderPage()
    await fillValidForm(user, { groupPricing: false })

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'insert').payload.group_pricing).toBe(false)
  })

  it('promotes the user to a host and lands them on the hosting tab', async () => {
    const { user, currentPath } = renderPage()
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'update').payload).toEqual({ is_host: true })
    await waitFor(() => expect(currentPath()).toBe('/hosting'))
  })

  it('stops and reports a failed insert without promoting the user', async () => {
    supabase.__on('listings', 'insert', { error: { message: 'row level security' } })
    const { user, currentPath } = renderPage()
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(await screen.findByText('row level security')).toBeInTheDocument()
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
    expect(currentPath()).toBe('/create-listing')
  })

  it('reports a failure to flag the user as a host', async () => {
    supabase.__on('users', 'update', { error: { message: 'update blocked' } })
    const { user, currentPath } = renderPage()
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(await screen.findByText('update blocked')).toBeInTheDocument()
    expect(currentPath()).toBe('/create-listing')
  })
})

describe('CreateListing "what is provided"', () => {
  beforeEach(() => {
    givenSignedIn()
    givenVerification('approved')
  })

  it('records the selected options', async () => {
    const { user } = renderPage()
    await fillValidForm(user)
    await user.click(screen.getByRole('checkbox', { name: 'Materials' }))
    await user.click(screen.getByRole('checkbox', { name: 'Equipment' }))

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'insert').payload.whats_provided).toEqual([
      'Materials',
      'Equipment',
    ])
  })

  it('unticks an option that was chosen by mistake', async () => {
    const { user } = renderPage()
    await fillValidForm(user)
    await user.click(screen.getByRole('checkbox', { name: 'Materials' }))
    await user.click(screen.getByRole('checkbox', { name: 'Equipment' }))

    await user.click(screen.getByRole('checkbox', { name: 'Materials' }))

    expect(screen.getByRole('checkbox', { name: 'Materials' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Equipment' })).toBeChecked()
  })

  it('clears the other options when "None" is chosen', async () => {
    const { user } = renderPage()
    await fillValidForm(user)
    await user.click(screen.getByRole('checkbox', { name: 'Materials' }))
    await user.click(screen.getByRole('checkbox', { name: 'None' }))

    expect(screen.getByRole('checkbox', { name: 'Materials' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Materials' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'None' })).toBeChecked()
    expect(screen.getByLabelText('Add your own')).toBeDisabled()
  })

  it('drops "None" again when a real option is picked', async () => {
    const { user } = renderPage()
    await fillValidForm(user)
    await user.click(screen.getByRole('checkbox', { name: 'None' }))
    expect(screen.getByRole('checkbox', { name: 'Food & drinks' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'None' }))
    await user.click(screen.getByRole('checkbox', { name: 'Food & drinks' }))

    expect(screen.getByRole('checkbox', { name: 'None' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Food & drinks' })).toBeChecked()
  })

  it('stores a custom item on the listing', async () => {
    const { user } = renderPage()
    await fillValidForm(user)
    await user.type(screen.getByLabelText('Add your own'), 'Apron')
    await user.click(screen.getByRole('button', { name: '+ Add your own' }))

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'insert').payload.whats_provided).toEqual(['Apron'])
  })

  it('saves an empty list when "None" is submitted', async () => {
    const { user } = renderPage()
    await fillValidForm(user)
    await user.click(screen.getByRole('checkbox', { name: 'None' }))

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'insert').payload.whats_provided).toEqual([])
  })
})

describe('CreateListing photos', () => {
  beforeEach(() => {
    givenSignedIn('host-9')
    givenVerification('approved')
  })

  function selectFiles(files) {
    fireEvent.change(screen.getByLabelText('Photos'), { target: { files } })
  }

  it('tells the host the photo maximum before they pick any', async () => {
    const { user } = renderPage()
    await goToPhotos(user)
    expect(screen.getByText('Maximum of 5 photos (0/5)')).toBeInTheDocument()
  })

  it('previews each selected image and marks the first as the cover', async () => {
    const { user } = renderPage()
    await goToPhotos(user)

    selectFiles([imageFile('a.png'), imageFile('b.png')])

    expect(await screen.findByText('Maximum of 5 photos (2/5)')).toBeInTheDocument()
    expect(screen.getAllByText('Cover')).toHaveLength(1)
  })

  it('ignores files that are not images', async () => {
    const { user } = renderPage()
    await goToPhotos(user)

    selectFiles([new File(['x'], 'notes.txt', { type: 'text/plain' }), imageFile()])

    expect(await screen.findByText('Maximum of 5 photos (1/5)')).toBeInTheDocument()
  })

  it('caps the gallery at five photos', async () => {
    const { user } = renderPage()
    await goToPhotos(user)

    selectFiles(Array.from({ length: 8 }, (_, i) => imageFile(`p${i}.png`)))

    expect(await screen.findByText('Maximum of 5 photos (5/5)')).toBeInTheDocument()
    expect(screen.getByLabelText('Photos')).toBeDisabled()
  })

  it('shows the photo tips in the agreed tone', async () => {
    const { user } = renderPage()
    await goToPhotos(user)

    expect(screen.getByText('A few tips for great photos')).toBeInTheDocument()
    expect(
      screen.getByText('Natural light is your best friend. A window beats any flash.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Lead with the good stuff: the latte, the bowl, the finished piece.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Hands in action beat an empty room.')).toBeInTheDocument()
    expect(
      screen.getByText('Tidy the background so your skill takes centre stage.'),
    ).toBeInTheDocument()
  })

  it('lets a photo be removed before submitting', async () => {
    const { user } = renderPage()
    await goToPhotos(user)
    selectFiles([imageFile('a.png'), imageFile('b.png')])
    await screen.findByText('Maximum of 5 photos (2/5)')

    await user.click(screen.getAllByRole('button', { name: 'Remove photo' })[0])

    expect(await screen.findByText('Maximum of 5 photos (1/5)')).toBeInTheDocument()
  })

  it('asks before continuing with no photos, then lets the host skip', async () => {
    const { user } = renderPage()
    await goToPhotos(user)
    await next(user)

    expect(
      screen.getByText('Your skill deserves to be seen! Listings with photos get far more bookings.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add photos' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add photos' }))
    expect(screen.getByRole('heading', { name: 'Add photos' })).toBeInTheDocument()

    await next(user)
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    await stepHeading('Price and group size')
  })

  it('lets the host set a later photo as the cover', async () => {
    const { user } = renderPage()
    await goToPhotos(user)
    selectFiles([imageFile('a.png'), imageFile('b.png')])
    await screen.findByText('Maximum of 5 photos (2/5)')

    await user.click(screen.getByRole('button', { name: 'Set as cover' }))

    const items = document.querySelectorAll('.preview-item')
    expect(items[0].querySelector('.preview-item__cover')).toHaveTextContent('Cover')
  })

  it('opens the cover crop dialog', async () => {
    const { user } = renderPage()
    await goToPhotos(user)
    selectFiles([imageFile('a.png')])
    await screen.findByText('Maximum of 5 photos (1/5)')

    await user.click(screen.getByRole('button', { name: 'Crop' }))

    expect(screen.getByText('Crop the cover to the listing card')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Free' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use this crop' })).toBeDisabled()
  })

  it('moves a photo with the left and right buttons', async () => {
    const { user } = renderPage()
    await goToPhotos(user)
    selectFiles([imageFile('a.png'), imageFile('b.png')])
    await screen.findByText('Maximum of 5 photos (2/5)')

    await user.click(screen.getAllByRole('button', { name: 'Move photo right' })[0])

    expect(screen.getByRole('button', { name: 'Set as cover' })).toBeInTheDocument()
    expect(document.querySelector('.preview-item__cover')).toBeInTheDocument()
  })

  async function publishWithOnePhoto(user) {
    await goToPhotos(user)
    selectFiles([imageFile('a.png')])
    await screen.findByText('Maximum of 5 photos (1/5)')
    await next(user)
    await stepHeading('Price and group size')
    await completePrice(user, VALID)
    await stepHeading('Where it happens')
    await completeLocation(user, VALID)
    await stepHeading('Final touches')
    await user.click(screen.getByRole('checkbox', { name: /I agree to the Host terms/ }))
  }

  it('uploads the photos and saves their public URLs on the listing', async () => {
    const { user } = renderPage()
    await publishWithOnePhoto(user)

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    const { photo_urls: photoUrls } = supabase.__lastCall('listings', 'insert').payload
    expect(photoUrls).toHaveLength(1)
    expect(photoUrls[0]).toMatch(/^https:\/\/cdn\.test\/listing-photos\/host-9\/.+\.png$/)
    expect(supabase.__bucket('listing-photos').upload).toHaveBeenCalledOnce()
  })

  it('abandons the listing when a photo fails to upload', async () => {
    const { user } = renderPage()
    await publishWithOnePhoto(user)
    supabase
      .__bucket('listing-photos')
      .upload.mockResolvedValue({ data: null, error: { message: 'storage full' } })

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(await screen.findByText(PHOTO_UPLOAD_ERROR)).toBeInTheDocument()
    expect(supabase.__calls('listings', 'insert')).toHaveLength(0)
  })
})

describe('CreateListing drafts', () => {
  beforeEach(() => {
    givenSignedIn('host-9')
    givenVerification('approved')
  })

  it('saves a draft on this device and offers to restore it next time', async () => {
    const first = renderPage()
    await stepHeading('The basics')
    await first.user.type(screen.getByLabelText('Title'), 'Pottery taster')
    await first.user.click(screen.getByRole('radio', { name: 'Arts' }))
    await first.user.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(screen.getByText(/Draft saved on this device/)).toBeInTheDocument()
    first.unmount()

    const second = renderPage()
    await stepHeading('The basics')
    expect(screen.getByText('You have a saved draft on this device.')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('')

    await second.user.click(screen.getByRole('button', { name: 'Restore draft' }))

    expect(screen.getByLabelText('Title')).toHaveValue('Pottery taster')
    expect(screen.getByRole('radio', { name: 'Arts' })).toBeChecked()
  })

  it('throws the draft away on Discard', async () => {
    window.localStorage.setItem(
      'trykai:listing-draft:host-9',
      JSON.stringify({ title: 'Old idea' })
    )
    const { user } = renderPage()
    await stepHeading('The basics')

    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.queryByText('You have a saved draft on this device.')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('trykai:listing-draft:host-9')).toBeNull()
  })

  it('clears the draft once the listing is published', async () => {
    window.localStorage.setItem('trykai:listing-draft:host-9', JSON.stringify({ title: 'x' }))
    const { user } = renderPage()
    await stepHeading('The basics')
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    window.localStorage.setItem('trykai:listing-draft:host-9', JSON.stringify({ title: 'x' }))
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    await waitFor(() =>
      expect(window.localStorage.getItem('trykai:listing-draft:host-9')).toBeNull()
    )
  })
})
