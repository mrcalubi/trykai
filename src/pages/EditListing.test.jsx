import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EditListing from './EditListing'
import RequireAuth from '../components/RequireAuth'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession, makeListing } from '../test/fixtures'

vi.mock('../lib/supabase')

const HOST_ID = 'host-9'

function givenSignedIn(userId = HOST_ID) {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: userId } }) },
    error: null,
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
      full_address: '12 Coffee Road',
      whats_provided: ['Materials'],
      photo_urls: ['https://cdn.test/one.jpg'],
      ...overrides,
    }),
    error: null,
  })
}

// Mounted behind the same guard App.jsx puts it behind, so the page always has
// a signed-in user. RequireAuth owns the signed-out case and tests it itself.
function renderPage() {
  return renderWithRouter(
    <RequireAuth>
      <EditListing />
    </RequireAuth>,
    { route: '/edit-listing/listing-1', path: '/edit-listing/:id' }
  )
}

async function renderLoaded() {
  const utils = renderPage()
  await screen.findByRole('heading', { name: 'Edit listing' })
  return utils
}

function imageFile(name = 'new.png') {
  return new File(['binary'], name, { type: 'image/png' })
}

beforeEach(() => {
  supabase.__reset()
  givenSignedIn()
  givenListing()
})

describe('EditListing access control', () => {
  it('only loads a listing the signed-in user hosts', async () => {
    await renderLoaded()

    const call = supabase.__lastCall('listings', 'select')
    expect(call.filters).toContainEqual({ method: 'eq', column: 'id', value: 'listing-1' })
    expect(call.filters).toContainEqual({ method: 'eq', column: 'host_id', value: HOST_ID })
  })

  it('shows a not-found message for a listing that is not theirs', async () => {
    supabase.__on('listings', 'select', { data: null, error: null })
    renderPage()

    expect(await screen.findByText('Listing not found.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit listing' })).not.toBeInTheDocument()
  })

  it('surfaces a fetch error instead of the form', async () => {
    supabase.__on('listings', 'select', { data: null, error: { message: 'permission denied' } })
    renderPage()

    expect(await screen.findByText('permission denied')).toBeInTheDocument()
  })
})

describe('EditListing prefill', () => {
  it('fills the form with the saved listing', async () => {
    await renderLoaded()

    expect(screen.getByLabelText('Title')).toHaveValue('Latte art')
    expect(screen.getByLabelText('Description')).toHaveValue('Pull a rosetta.')
    expect(screen.getByLabelText('Category')).toHaveValue('Food')
    expect(screen.getByLabelText('Max guests')).toHaveValue(4)
    expect(screen.getByLabelText('Area')).toHaveValue('Bedok')
    expect(screen.getByLabelText(/^Full address/)).toHaveValue('12 Coffee Road')
  })

  it('converts the stored cents back into dollars', async () => {
    givenListing({ price_per_person: 4500 })
    await renderLoaded()

    expect(screen.getByLabelText('Price per person (SGD)')).toHaveValue(45)
  })

  it('keeps the cents when the stored price is not a whole dollar', async () => {
    givenListing({ price_per_person: 1999 })
    await renderLoaded()

    expect(screen.getByLabelText('Price per person (SGD)')).toHaveValue(19.99)
  })

  it('ticks the saved "what is provided" options', async () => {
    givenListing({ whats_provided: ['Materials', 'Equipment'] })
    await renderLoaded()

    expect(screen.getByRole('checkbox', { name: 'Materials' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Equipment' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'None' })).not.toBeChecked()
  })

  it('copes with a listing that has no provided list', async () => {
    givenListing({ whats_provided: null })
    await renderLoaded()

    expect(screen.getByRole('checkbox', { name: 'Materials' })).not.toBeChecked()
  })

  it('shows the existing photos', async () => {
    givenListing({ photo_urls: ['https://cdn.test/one.jpg', 'https://cdn.test/two.jpg'] })
    await renderLoaded()

    expect(screen.getByText('Up to 5 images (2/5)')).toBeInTheDocument()
  })

  it('copes with a listing that has no photos', async () => {
    givenListing({ photo_urls: null })
    await renderLoaded()

    expect(screen.getByText('Up to 5 images (0/5)')).toBeInTheDocument()
  })
})

describe('EditListing validation', () => {
  function submitForm() {
    fireEvent.submit(document.querySelector('form'))
  }

  it('rejects a title that is only whitespace', async () => {
    const { user } = await renderLoaded()
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), '   ')

    submitForm()

    expect(await screen.findByText('Please fill in all required fields.')).toBeInTheDocument()
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })

  it('rejects a price of zero', async () => {
    const { user } = await renderLoaded()
    await user.clear(screen.getByLabelText('Price per person (SGD)'))
    await user.type(screen.getByLabelText('Price per person (SGD)'), '0')

    submitForm()

    expect(await screen.findByText('Please enter a valid price.')).toBeInTheDocument()
  })

  it('rejects an empty price', async () => {
    const { user } = await renderLoaded()
    await user.clear(screen.getByLabelText('Price per person (SGD)'))

    submitForm()

    expect(await screen.findByText('Please enter a valid price.')).toBeInTheDocument()
  })

  it('rejects a guest count below one', async () => {
    const { user } = await renderLoaded()
    await user.clear(screen.getByLabelText('Max guests'))
    await user.type(screen.getByLabelText('Max guests'), '0')

    submitForm()

    expect(await screen.findByText('Max guests must be at least 1.')).toBeInTheDocument()
  })
})

describe('EditListing saving', () => {
  it('saves the edited fields against the host own listing', async () => {
    const { user } = await renderLoaded()
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Latte art, level two ')
    await user.clear(screen.getByLabelText('Price per person (SGD)'))
    await user.type(screen.getByLabelText('Price per person (SGD)'), '55.25')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    const call = supabase.__lastCall('listings', 'update')
    expect(call.payload).toMatchObject({
      title: 'Latte art, level two',
      price_per_person: 5525,
      max_guests: 4,
      area: 'Bedok',
      full_address: '12 Coffee Road',
    })
    expect(call.filters).toContainEqual({ method: 'eq', column: 'host_id', value: HOST_ID })
  })

  it('saves a listing that has moved to a new address', async () => {
    const { user } = await renderLoaded()
    await user.selectOptions(screen.getByLabelText('Area'), 'Tampines')
    await user.clear(screen.getByLabelText(/^Full address/))
    await user.type(screen.getByLabelText(/^Full address/), '5 Espresso Lane')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload).toMatchObject({
      area: 'Tampines',
      full_address: '5 Espresso Lane',
    })
  })

  it('returns to the dashboard with a confirmation', async () => {
    const { user, currentPath, currentState } = await renderLoaded()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(currentPath()).toBe('/dashboard'))
    expect(currentState().message).toBe('Listing updated successfully.')
  })

  it('reports a rejected update and stays put', async () => {
    supabase.__on('listings', 'update', { error: { message: 'row level security' } })
    const { user, currentPath } = await renderLoaded()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('row level security')).toBeInTheDocument()
    expect(currentPath()).toBe('/edit-listing/listing-1')
  })

  it('saves an empty provided list when "None" is selected', async () => {
    const { user } = await renderLoaded()
    await user.click(screen.getByRole('checkbox', { name: 'None' }))

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.whats_provided).toEqual([])
  })

  it('toggles a provided option back off', async () => {
    const { user } = await renderLoaded()
    await user.click(screen.getByRole('checkbox', { name: 'Materials' }))

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.whats_provided).toEqual([])
  })
})

describe('EditListing photos', () => {
  function selectFiles(files) {
    fireEvent.change(screen.getByLabelText('Photos'), { target: { files } })
  }

  it('keeps the existing photos and appends the newly uploaded ones', async () => {
    const { user } = await renderLoaded()
    selectFiles([imageFile('two.png')])
    await screen.findByText('Up to 5 images (2/5)')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    const { photo_urls: photoUrls } = supabase.__lastCall('listings', 'update').payload
    expect(photoUrls[0]).toBe('https://cdn.test/one.jpg')
    expect(photoUrls[1]).toMatch(/^https:\/\/cdn\.test\/listing-photos\/host-9\/.+\.png$/)
  })

  it('lets a saved photo be removed', async () => {
    givenListing({ photo_urls: ['https://cdn.test/one.jpg', 'https://cdn.test/two.jpg'] })
    const { user } = await renderLoaded()

    await user.click(screen.getAllByRole('button', { name: 'Remove photo' })[0])

    expect(screen.getByText('Up to 5 images (1/5)')).toBeInTheDocument()
  })

  it('drops a removed photo from the saved listing', async () => {
    givenListing({ photo_urls: ['https://cdn.test/one.jpg', 'https://cdn.test/two.jpg'] })
    const { user } = await renderLoaded()
    await user.click(screen.getAllByRole('button', { name: 'Remove photo' })[0])

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(supabase.__calls('listings', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'update').payload.photo_urls).toEqual([
      'https://cdn.test/two.jpg',
    ])
  })

  it('lets a newly added photo be removed again', async () => {
    const { user } = await renderLoaded()
    selectFiles([imageFile('two.png')])
    await screen.findByText('Up to 5 images (2/5)')

    await user.click(screen.getAllByRole('button', { name: 'Remove photo' })[1])

    expect(screen.getByText('Up to 5 images (1/5)')).toBeInTheDocument()
  })

  it('ignores files that are not images', async () => {
    await renderLoaded()

    selectFiles([new File(['x'], 'notes.txt', { type: 'text/plain' })])

    expect(screen.getByText('Up to 5 images (1/5)')).toBeInTheDocument()
  })

  it('counts existing photos towards the five photo cap', async () => {
    givenListing({
      photo_urls: ['a', 'b', 'c', 'd'].map((name) => `https://cdn.test/${name}.jpg`),
    })
    await renderLoaded()

    selectFiles([imageFile('e.png'), imageFile('f.png'), imageFile('g.png')])

    expect(await screen.findByText('Up to 5 images (5/5)')).toBeInTheDocument()
    expect(screen.getByLabelText('Photos')).toBeDisabled()
  })

  it('abandons the save when a photo fails to upload', async () => {
    const { user } = await renderLoaded()
    selectFiles([imageFile('two.png')])
    await screen.findByText('Up to 5 images (2/5)')
    supabase
      .__bucket('listing-photos')
      .upload.mockResolvedValue({ data: null, error: { message: 'storage full' } })

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('storage full')).toBeInTheDocument()
    expect(supabase.__calls('listings', 'update')).toHaveLength(0)
  })
})
