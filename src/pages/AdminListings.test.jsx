import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminListings from './AdminListings'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

function makeListing(overrides = {}) {
  return {
    id: 'listing-1',
    title: 'Latte art for beginners',
    description: 'Pour hearts and tulips on your own flat white.',
    category: 'Food',
    area: 'Tiong Bahru',
    price_per_person: 4500,
    duration_mins: 90,
    photo_urls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'],
    whats_provided: ['Milk', 'Espresso'],
    what_to_bring: ['Apron'],
    review_status: 'pending',
    review_note: null,
    review_requested_at: '2026-10-23T02:00:00.000Z',
    host: {
      id: 'host-1',
      name: 'Mei Ling',
      email: 'mei@example.com',
      verification_method: 'singpass',
      verified_name: 'TAN MEI LING',
      teaching_plan: null,
    },
    ...overrides,
  }
}

function givenQueue(listings, { reviewResult } = {}) {
  supabase.functions.invoke.mockImplementation(async (name, options) => {
    if (name !== 'admin-listings') return { data: null, error: null }
    if (options?.body?.action === 'list') return { data: { listings }, error: null }
    if (options?.body?.action === 'review') return reviewResult ?? { data: { ok: true }, error: null }
    return { data: null, error: null }
  })
}

function reviewCalls() {
  return supabase.functions.invoke.mock.calls.filter(([, options]) => options?.body?.action === 'review')
}

function renderPage() {
  return renderWithRouter(<AdminListings />, { route: '/admin/listings', path: '/admin/listings' })
}

function cardFor(title) {
  return screen.getByText(title).closest('article')
}

beforeEach(() => {
  supabase.__reset()
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: 'admin-1' } }) },
    error: null,
  })
})

describe('AdminListings', () => {
  it('shows everything a reviewer needs on one card', async () => {
    givenQueue([makeListing()])
    renderPage()

    expect(await screen.findByText('Latte art for beginners')).toBeInTheDocument()
    const card = cardFor('Latte art for beginners')
    expect(within(card).getByText('Food · Tiong Bahru · S$45 per person · 1 hr 30 min')).toBeInTheDocument()
    expect(within(card).getByText('Pour hearts and tulips on your own flat white.')).toBeInTheDocument()
    expect(within(card).getByText('Provided: Milk, Espresso')).toBeInTheDocument()
    expect(within(card).getByText('What to bring: Apron')).toBeInTheDocument()
    expect(within(card).getByText(/Singpass: TAN MEI LING/)).toBeInTheDocument()
    expect(within(card).getAllByRole('img')).toHaveLength(2)
    const [, options] = supabase.functions.invoke.mock.calls[0]
    expect(options.headers.Authorization).toMatch(/^Bearer /)
  })

  it('says when nothing is waiting', async () => {
    givenQueue([])
    renderPage()

    expect(await screen.findByText('Nothing waiting for review.')).toBeInTheDocument()
  })

  it('shows an upload-verified host and what they said they would teach', async () => {
    givenQueue([
      makeListing({
        photo_urls: [],
        whats_provided: [],
        host: { ...makeListing().host, verification_method: 'manual', teaching_plan: 'Coffee' },
      }),
    ])
    renderPage()

    await screen.findByText('Latte art for beginners')
    const card = cardFor('Latte art for beginners')
    expect(within(card).getByText(/Verified by ID upload/)).toBeInTheDocument()
    expect(within(card).getByText('Coffee')).toBeInTheDocument()
    expect(within(card).getByText('No photos')).toBeInTheDocument()
  })

  it('approves a listing and takes it off the queue', async () => {
    givenQueue([makeListing()])
    const { user } = renderPage()
    await screen.findByText('Latte art for beginners')

    await user.click(screen.getByRole('button', { name: 'Approve and go live' }))

    expect(
      await screen.findByText('"Latte art for beginners" is live. Mei Ling has been emailed.')
    ).toBeInTheDocument()
    expect(reviewCalls()[0][1].body).toEqual({
      action: 'review',
      listing_id: 'listing-1',
      decision: 'approved',
      note: undefined,
    })
    expect(screen.queryByRole('button', { name: 'Approve and go live' })).not.toBeInTheDocument()
  })

  it('needs a note before asking for a change', async () => {
    givenQueue([makeListing()])
    const { user } = renderPage()
    await screen.findByText('Latte art for beginners')

    await user.click(screen.getByRole('button', { name: 'Ask for a change' }))

    expect(
      await screen.findByText('Write the change you need before sending "Latte art for beginners" back.')
    ).toBeInTheDocument()
    expect(reviewCalls()).toHaveLength(0)
  })

  it('sends the note to the host and moves the listing to "waiting on the host"', async () => {
    givenQueue([makeListing()])
    const { user } = renderPage()
    await screen.findByText('Latte art for beginners')

    await user.type(screen.getByLabelText(/^Change needed/), '  Add a photo of the latte  ')
    await user.click(screen.getByRole('button', { name: 'Ask for a change' }))

    await waitFor(() => expect(reviewCalls()).toHaveLength(1))
    expect(reviewCalls()[0][1].body).toMatchObject({
      decision: 'changes_requested',
      note: 'Add a photo of the latte',
    })
    expect(
      await screen.findByText('Sent "Latte art for beginners" back to Mei Ling with your note.')
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Waiting on the host' })).toBeInTheDocument()
    expect(screen.getByText('Add a photo of the latte')).toBeInTheDocument()
    expect(screen.getByText('Nothing new to review.')).toBeInTheDocument()
  })

  it('caps the note at 500 characters', async () => {
    givenQueue([makeListing()])
    renderPage()

    expect(await screen.findByLabelText(/^Change needed/)).toHaveAttribute('maxlength', '500')
  })

  it('shows the reason when a decision fails', async () => {
    givenQueue([makeListing()], { reviewResult: { data: { error: 'listing not found' }, error: null } })
    const { user } = renderPage()
    await screen.findByText('Latte art for beginners')

    await user.click(screen.getByRole('button', { name: 'Approve and go live' }))

    expect(await screen.findByText('listing not found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve and go live' })).toBeInTheDocument()
  })

  it('shows the reason when the queue cannot load', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { error: 'Not authorised' }, error: null })
    renderPage()

    expect(await screen.findByText('Not authorised')).toBeInTheDocument()
  })
})
