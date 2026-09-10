import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminVerifications from './AdminVerifications'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

function makePending(overrides = {}) {
  return {
    id: 'host-9',
    full_name: 'Mei Ling',
    email: 'mei@example.com',
    submitted_at: '2026-09-01T02:00:00.000Z',
    id_photo_url: 'https://cdn.test/signed/id.jpg',
    selfie_url: 'https://cdn.test/signed/selfie.jpg',
    ...overrides,
  }
}

/** Routes both function actions through one place, as the page does. */
function givenQueue(pending, { reviewResult } = {}) {
  supabase.functions.invoke.mockImplementation(async (name, options) => {
    if (name !== 'admin-verifications') return { data: null, error: null }
    if (options?.body?.action === 'list') return { data: { pending }, error: null }
    if (options?.body?.action === 'review') {
      return reviewResult ?? { data: { ok: true }, error: null }
    }
    return { data: null, error: null }
  })
}

function reviewCalls() {
  return supabase.functions.invoke.mock.calls.filter(
    ([name, options]) => name === 'admin-verifications' && options?.body?.action === 'review'
  )
}

function cardFor(name) {
  return screen.getByText(name).closest('.dashboard-card')
}

function renderPage() {
  return renderWithRouter(<AdminVerifications />, {
    route: '/admin/verifications',
    path: '/admin/verifications',
  })
}

beforeEach(() => {
  supabase.__reset()
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: 'admin-1' } }) },
    error: null,
  })
})

describe('AdminVerifications queue', () => {
  it('lists a pending host with both documents side by side', async () => {
    givenQueue([makePending()])
    renderPage()

    expect(await screen.findByText('Mei Ling')).toBeInTheDocument()
    const card = cardFor('Mei Ling')
    expect(within(card).getByAltText('ID document')).toHaveAttribute(
      'src',
      'https://cdn.test/signed/id.jpg'
    )
    expect(within(card).getByAltText('Selfie')).toHaveAttribute(
      'src',
      'https://cdn.test/signed/selfie.jpg'
    )
  })

  it('sends the signed-in reviewer token with the request', async () => {
    givenQueue([makePending()])
    renderPage()
    await screen.findByText('Mei Ling')

    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-verifications', {
      body: { action: 'list' },
      headers: { Authorization: 'Bearer test-access-token' },
    })
  })

  it('says so when the queue is empty', async () => {
    givenQueue([])
    renderPage()

    expect(await screen.findByText('Nothing waiting for review.')).toBeInTheDocument()
  })

  it('notes a submission that is missing a document rather than hiding it', async () => {
    givenQueue([makePending({ selfie_url: null })])
    renderPage()
    await screen.findByText('Mei Ling')

    const card = cardFor('Mei Ling')
    expect(within(card).getByText('Not uploaded')).toBeInTheDocument()
    expect(within(card).getByAltText('ID document')).toBeInTheDocument()
  })

  it('surfaces a refusal from the function', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'Not authorised' }) },
      },
    })
    renderPage()

    expect(await screen.findByText('Not authorised')).toBeInTheDocument()
  })
})

describe('AdminVerifications decisions', () => {
  it('approves a host and drops them from the queue', async () => {
    givenQueue([makePending()])
    const { user } = renderPage()
    await screen.findByText('Mei Ling')

    await user.click(within(cardFor('Mei Ling')).getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(reviewCalls()).toHaveLength(1))
    expect(reviewCalls()[0][1].body).toEqual({
      action: 'review',
      user_id: 'host-9',
      decision: 'approve',
      reason: undefined,
    })
    expect(await screen.findByText(/Mei Ling approved/)).toBeInTheDocument()
    expect(screen.queryByText('Mei Ling')).not.toBeInTheDocument()
  })

  it('refuses to reject without a reason, since the host is told why', async () => {
    givenQueue([makePending()])
    const { user } = renderPage()
    await screen.findByText('Mei Ling')

    await user.click(within(cardFor('Mei Ling')).getByRole('button', { name: 'Reject' }))

    expect(await screen.findByText(/Add a reason before rejecting Mei Ling/)).toBeInTheDocument()
    expect(reviewCalls()).toHaveLength(0)
  })

  it('rejects with the trimmed reason and confirms it was emailed', async () => {
    givenQueue([makePending()])
    const { user } = renderPage()
    await screen.findByText('Mei Ling')

    const card = cardFor('Mei Ling')
    await user.type(within(card).getByLabelText(/Rejection reason/), '  ID photo is blurry  ')
    await user.click(within(card).getByRole('button', { name: 'Reject' }))

    await waitFor(() => expect(reviewCalls()).toHaveLength(1))
    expect(reviewCalls()[0][1].body).toMatchObject({
      user_id: 'host-9',
      decision: 'reject',
      reason: 'ID photo is blurry',
    })
    expect(await screen.findByText(/reason has been emailed/)).toBeInTheDocument()
  })

  it('keeps the host in the queue when the decision fails', async () => {
    givenQueue([makePending()], {
      reviewResult: { data: { error: 'a rejection reason is required' }, error: null },
    })
    const { user } = renderPage()
    await screen.findByText('Mei Ling')

    await user.click(within(cardFor('Mei Ling')).getByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('a rejection reason is required')).toBeInTheDocument()
    expect(screen.getByText('Mei Ling')).toBeInTheDocument()
  })

  it('tracks reasons per host so two rows cannot be mixed up', async () => {
    givenQueue([makePending(), makePending({ id: 'host-10', full_name: 'Arun' })])
    const { user } = renderPage()
    await screen.findByText('Arun')

    await user.type(
      within(cardFor('Arun')).getByLabelText(/Rejection reason/),
      'Selfie does not match'
    )

    expect(within(cardFor('Mei Ling')).getByLabelText(/Rejection reason/)).toHaveValue('')
    await user.click(within(cardFor('Arun')).getByRole('button', { name: 'Reject' }))

    await waitFor(() => expect(reviewCalls()).toHaveLength(1))
    expect(reviewCalls()[0][1].body).toMatchObject({
      user_id: 'host-10',
      reason: 'Selfie does not match',
    })
  })
})
