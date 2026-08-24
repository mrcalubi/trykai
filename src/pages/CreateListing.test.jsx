import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateListing from './CreateListing'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

function givenSignedIn(userId = 'host-1') {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: userId } }) },
    error: null,
  })
}

function givenVerification(status) {
  supabase.__on('users', 'select', { data: { verification_status: status }, error: null })
}

// The route pattern has to be pinned. Under the helper's catch-all default the
// page stays mounted after it redirects, which App.jsx never does, and its auth
// effect fires a second time from /login.
function renderPage() {
  return renderWithRouter(<CreateListing />, {
    route: '/create-listing',
    path: '/create-listing',
  })
}

/**
 * Fills every field the form needs to reach its own validation code. Values are
 * chosen so the browser's constraint validation is satisfied too.
 */
async function fillValidForm(user, overrides = {}) {
  const values = {
    title: 'Learn latte art with me',
    description: 'Pull your first rosetta.',
    category: 'Food',
    price: '45',
    maxGuests: '4',
    area: 'Bedok',
    fullAddress: '12 Coffee Road',
    ...overrides,
  }

  await user.clear(screen.getByLabelText('Title'))
  await user.type(screen.getByLabelText('Title'), values.title)
  await user.type(screen.getByLabelText('Description'), values.description)
  await user.selectOptions(screen.getByLabelText('Category'), values.category)
  await user.type(screen.getByLabelText('Price per person (SGD)'), values.price)
  await user.type(screen.getByLabelText('Max guests'), values.maxGuests)
  await user.selectOptions(screen.getByLabelText('Area'), values.area)
  // The address label also wraps a hint span, so it needs a partial match.
  await user.type(screen.getByLabelText(/^Full address/), values.fullAddress)
  return values
}

function imageFile(name = 'photo.png') {
  return new File(['binary'], name, { type: 'image/png' })
}

beforeEach(() => {
  supabase.__reset()
})

describe('CreateListing access control', () => {
  it('sends signed-out visitors to log in and remembers where they were going', async () => {
    const { currentPath, currentState } = renderPage()

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(currentState().from.pathname).toBe('/create-listing')
    // A second auth check would redirect again and overwrite `from` with /login,
    // leaving the visitor stranded on the login page after they sign in.
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1)
  })

  // The pinned route unmounts the page on redirect, which would mask an auth
  // effect that re-runs. Mounting at the catch-all keeps the page alive so a
  // second redirect would be visible.
  it('keeps the return path when the page outlives the redirect', async () => {
    const { currentPath, currentState } = renderWithRouter(<CreateListing />, {
      route: '/create-listing',
    })

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(currentState().from.pathname).toBe('/create-listing')
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1)
  })

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
    supabase.__on('users', 'select', { data: null, error: null })
    const { currentPath } = renderPage()

    await waitFor(() => expect(currentPath()).toBe('/verify-identity'))
  })

  it('holds hosts whose verification is still under review', async () => {
    givenSignedIn()
    givenVerification('pending')
    renderPage()

    expect(await screen.findByText('Verification under review')).toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
  })

  it('shows the form to an approved host', async () => {
    givenSignedIn()
    givenVerification('approved')
    renderPage()

    expect(await screen.findByLabelText('Title')).toBeInTheDocument()
  })
})

describe('CreateListing validation', () => {
  beforeEach(() => {
    givenSignedIn()
    givenVerification('approved')
  })

  // fireEvent.submit bypasses the browser's own constraint validation, which is
  // exactly what a crafted request would do, so it exercises the JS guards.
  function submitForm() {
    fireEvent.submit(document.querySelector('form'))
  }

  it('rejects a title that is only whitespace', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
    await fillValidForm(user, { title: '   ' })

    submitForm()

    expect(await screen.findByText('Please fill in all required fields.')).toBeInTheDocument()
    expect(supabase.__calls('listings', 'insert')).toHaveLength(0)
  })

  it('rejects a blank address', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
    await fillValidForm(user, { fullAddress: '  ' })

    submitForm()

    expect(await screen.findByText('Please fill in all required fields.')).toBeInTheDocument()
  })

  it('rejects a price of zero', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
    await fillValidForm(user, { price: '0' })

    submitForm()

    expect(await screen.findByText('Please enter a valid price.')).toBeInTheDocument()
    expect(supabase.__calls('listings', 'insert')).toHaveLength(0)
  })

  it('rejects a guest count below one', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
    await fillValidForm(user, { maxGuests: '0' })

    submitForm()

    expect(await screen.findByText('Max guests must be at least 1.')).toBeInTheDocument()
  })
})

describe('CreateListing submission', () => {
  beforeEach(() => {
    givenSignedIn('host-9')
    givenVerification('approved')
  })

  it('stores the price in cents and trims the free-text fields', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
    await fillValidForm(user, { title: 'Latte art  ', price: '45.50' })

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'insert').payload).toMatchObject({
      host_id: 'host-9',
      title: 'Latte art',
      category: 'Food',
      price_per_person: 4550,
      max_guests: 4,
      area: 'Bedok',
      full_address: '12 Coffee Road',
      is_active: true,
    })
  })

  it('rounds a fractional cent price to the nearest cent', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
    await fillValidForm(user, { price: '19.99' })

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('listings', 'insert').payload.price_per_person).toBe(1999)
  })

  it('promotes the user to a host and lands them on the dashboard', async () => {
    const { user, currentPath } = renderPage()
    await screen.findByLabelText('Title')
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'update').payload).toEqual({ is_host: true })
    await waitFor(() => expect(currentPath()).toBe('/dashboard'))
  })

  it('stops and reports a failed insert without promoting the user', async () => {
    supabase.__on('listings', 'insert', { error: { message: 'row level security' } })
    const { user, currentPath } = renderPage()
    await screen.findByLabelText('Title')
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(await screen.findByText('row level security')).toBeInTheDocument()
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
    expect(currentPath()).toBe('/create-listing')
  })

  it('reports a failure to flag the user as a host', async () => {
    supabase.__on('users', 'update', { error: { message: 'update blocked' } })
    const { user, currentPath } = renderPage()
    await screen.findByLabelText('Title')
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
    await screen.findByLabelText('Title')
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

  it('clears the other options when "None" is chosen', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
    await user.click(screen.getByRole('checkbox', { name: 'Materials' }))
    await user.click(screen.getByRole('checkbox', { name: 'None' }))

    expect(screen.getByRole('checkbox', { name: 'Materials' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'None' })).toBeChecked()
  })

  it('drops "None" again when a real option is picked', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
    await user.click(screen.getByRole('checkbox', { name: 'None' }))
    await user.click(screen.getByRole('checkbox', { name: 'Food & drinks' }))

    expect(screen.getByRole('checkbox', { name: 'None' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Food & drinks' })).toBeChecked()
  })

  it('saves an empty list when "None" is submitted', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
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

  it('previews each selected image', async () => {
    renderPage()
    await screen.findByLabelText('Photos')

    selectFiles([imageFile('a.png'), imageFile('b.png')])

    expect(await screen.findByText('Up to 5 images (2/5)')).toBeInTheDocument()
  })

  it('ignores files that are not images', async () => {
    renderPage()
    await screen.findByLabelText('Photos')

    selectFiles([new File(['x'], 'notes.txt', { type: 'text/plain' }), imageFile()])

    expect(await screen.findByText('Up to 5 images (1/5)')).toBeInTheDocument()
  })

  it('caps the gallery at five photos', async () => {
    renderPage()
    await screen.findByLabelText('Photos')

    selectFiles(Array.from({ length: 8 }, (_, i) => imageFile(`p${i}.png`)))

    expect(await screen.findByText('Up to 5 images (5/5)')).toBeInTheDocument()
    expect(screen.getByLabelText('Photos')).toBeDisabled()
  })

  it('lets a photo be removed before submitting', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Photos')
    selectFiles([imageFile('a.png'), imageFile('b.png')])
    await screen.findByText('Up to 5 images (2/5)')

    await user.click(screen.getAllByRole('button', { name: 'Remove photo' })[0])

    expect(await screen.findByText('Up to 5 images (1/5)')).toBeInTheDocument()
  })

  it('uploads the photos and saves their public URLs on the listing', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
    await fillValidForm(user)
    selectFiles([imageFile('a.png')])
    await screen.findByText('Up to 5 images (1/5)')

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(supabase.__calls('listings', 'insert')).toHaveLength(1))
    const { photo_urls: photoUrls } = supabase.__lastCall('listings', 'insert').payload
    expect(photoUrls).toHaveLength(1)
    expect(photoUrls[0]).toMatch(/^https:\/\/cdn\.test\/listing-photos\/host-9\/.+\.png$/)
    expect(supabase.__bucket('listing-photos').upload).toHaveBeenCalledOnce()
  })

  it('abandons the listing when a photo fails to upload', async () => {
    const { user } = renderPage()
    await screen.findByLabelText('Title')
    await fillValidForm(user)
    selectFiles([imageFile('a.png')])
    await screen.findByText('Up to 5 images (1/5)')
    supabase
      .__bucket('listing-photos')
      .upload.mockResolvedValue({ data: null, error: { message: 'storage full' } })

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(await screen.findByText('storage full')).toBeInTheDocument()
    expect(supabase.__calls('listings', 'insert')).toHaveLength(0)
  })
})
