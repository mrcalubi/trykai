import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VerifyIdentity from './VerifyIdentity'
import RequireAuth from '../components/RequireAuth'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

const USER_ID = 'host-9'

function givenSignedIn(userId = USER_ID) {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: userId } }) },
    error: null,
  })
}

/**
 * The page reads its own state through `my_verification` and submits through
 * `submit_verification`, because 00007 revokes the client's UPDATE grant on
 * the verification columns.
 */
function givenVerification(row, { submitError = null } = {}) {
  supabase.rpc.mockImplementation(async (fn) => {
    if (fn === 'my_verification') return { data: row === null ? [] : [row], error: null }
    if (fn === 'submit_verification') {
      return submitError ? { data: null, error: submitError } : { data: 'pending', error: null }
    }
    return { data: null, error: null }
  })
}

function givenStatus(status) {
  givenVerification({ verification_status: status })
}

function submitCalls() {
  return supabase.rpc.mock.calls.filter(([fn]) => fn === 'submit_verification')
}

// Mounted behind the same guard App.jsx puts it behind, so the page always has
// a signed-in user. RequireAuth owns the signed-out case and tests it itself.
function renderPage(options = {}) {
  return renderWithRouter(
    <RequireAuth>
      <VerifyIdentity />
    </RequireAuth>,
    { route: '/verify-identity', path: '/verify-identity', ...options }
  )
}

function attach(label, file) {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })
}

function imageFile(name) {
  return new File(['binary'], name, { type: 'image/png' })
}

async function renderFormWithBothPhotos({ consent = true } = {}) {
  const utils = renderPage()
  await screen.findByRole('heading', { name: 'Verify your identity' })
  attach(/^NRIC or passport photo/, imageFile('id.png'))
  attach(/^Selfie/, imageFile('selfie.png'))
  if (consent) {
    fireEvent.click(screen.getByRole('checkbox'))
  }
  return utils
}

beforeEach(() => {
  supabase.__reset()
  givenSignedIn()
  givenStatus('unverified')
})

describe('VerifyIdentity access control', () => {
  it('shows the upload form to an unverified host', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Verify your identity' })).toBeInTheDocument()
  })

  it('treats a missing verification record as unverified', async () => {
    givenVerification(null)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Verify your identity' })).toBeInTheDocument()
  })

  it('lets a rejected host try again', async () => {
    givenStatus('rejected')
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Verify your identity' })).toBeInTheDocument()
  })

  it('tells a rejected host why, so the resubmission can fix it', async () => {
    givenVerification({
      verification_status: 'rejected',
      verification_rejection_reason: 'ID photo is unreadable',
    })
    renderPage()

    expect(
      await screen.findByText(/Your last submission was not approved: ID photo is unreadable/)
    ).toBeInTheDocument()
  })

  it('tells a host their documents are already under review', async () => {
    givenStatus('pending')
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Under review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit for review' })).not.toBeInTheDocument()
  })

  it('sends an approved host on to create a listing', async () => {
    givenStatus('approved')
    const { user, currentPath } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Create a listing' }))

    await waitFor(() => expect(currentPath()).toBe('/create-listing'))
  })

  it('relays the reason the host was sent here', async () => {
    renderPage({
      route: {
        pathname: '/verify-identity',
        state: { message: 'You need to verify your identity before you can host on TryKai.' },
      },
    })

    expect(
      await screen.findByText('You need to verify your identity before you can host on TryKai.')
    ).toBeInTheDocument()
  })
})

describe('VerifyIdentity submission', () => {
  it('requires both documents', async () => {
    const { user } = renderPage()
    await screen.findByRole('heading', { name: 'Verify your identity' })

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(
      await screen.findByText('Please upload both your ID photo and a selfie.')
    ).toBeInTheDocument()
    expect(supabase.__bucket('verification-docs').upload).not.toHaveBeenCalled()
  })

  it('requires a selfie alongside the ID', async () => {
    const { user } = renderPage()
    await screen.findByRole('heading', { name: 'Verify your identity' })
    attach(/^NRIC or passport photo/, imageFile('id.png'))

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(
      await screen.findByText('Please upload both your ID photo and a selfie.')
    ).toBeInTheDocument()
  })

  it('forgets a document the host clears out of the picker again', async () => {
    const { user } = await renderFormWithBothPhotos()
    fireEvent.change(screen.getByLabelText(/^NRIC or passport photo/), { target: { files: [] } })

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(
      await screen.findByText('Please upload both your ID photo and a selfie.')
    ).toBeInTheDocument()
    expect(supabase.__bucket('verification-docs').upload).not.toHaveBeenCalled()
  })

  it('uploads both documents to a folder scoped to the user', async () => {
    const { user } = await renderFormWithBothPhotos()

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    const bucket = supabase.__bucket('verification-docs')
    await waitFor(() => expect(bucket.upload).toHaveBeenCalledTimes(2))
    expect(bucket.upload.mock.calls[0][0]).toBe('host-9/id-photo.jpg')
    expect(bucket.upload.mock.calls[1][0]).toBe('host-9/selfie.jpg')
  })

  it('overwrites a previous submission rather than failing', async () => {
    const { user } = await renderFormWithBothPhotos()

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    const bucket = supabase.__bucket('verification-docs')
    await waitFor(() => expect(bucket.upload).toHaveBeenCalledTimes(2))
    for (const call of bucket.upload.mock.calls) {
      expect(call[2]).toEqual({ upsert: true })
    }
  })

  it('moves the host into the pending queue through submit_verification', async () => {
    const { user } = await renderFormWithBothPhotos()

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    await waitFor(() => expect(submitCalls()).toHaveLength(1))
    expect(submitCalls()[0][1]).toEqual({
      p_id_photo_url: 'host-9/id-photo.jpg',
      p_selfie_url: 'host-9/selfie.jpg',
      p_consent: true,
    })
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
  })

  it('will not submit without consent to the identity check', async () => {
    const { user } = await renderFormWithBothPhotos({ consent: false })

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(
      await screen.findByText('Please confirm you agree to TryKai verifying your identity.')
    ).toBeInTheDocument()
    expect(submitCalls()).toHaveLength(0)
  })

  it('confirms the submission to the host', async () => {
    const { user } = await renderFormWithBothPhotos()

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByRole('heading', { name: 'Under review' })).toBeInTheDocument()
  })

  it('stops when the ID upload fails', async () => {
    const { user } = await renderFormWithBothPhotos()
    supabase
      .__bucket('verification-docs')
      .upload.mockResolvedValueOnce({ data: null, error: { message: 'file too large' } })

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByText('file too large')).toBeInTheDocument()
    expect(submitCalls()).toHaveLength(0)
  })

  it('stops when the selfie upload fails', async () => {
    const { user } = await renderFormWithBothPhotos()
    const bucket = supabase.__bucket('verification-docs')
    bucket.upload
      .mockResolvedValueOnce({ data: { path: 'ok' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'selfie rejected' } })

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByText('selfie rejected')).toBeInTheDocument()
    expect(submitCalls()).toHaveLength(0)
  })

  it('reports a failure to record the pending status', async () => {
    givenVerification(
      { verification_status: 'unverified' },
      { submitError: { message: 'verification cannot be submitted from status pending' } }
    )
    const { user } = await renderFormWithBothPhotos()

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(
      await screen.findByText('verification cannot be submitted from status pending')
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Under review' })).not.toBeInTheDocument()
  })

  it('clears a chosen file when the picker is emptied', async () => {
    const { user } = await renderFormWithBothPhotos()
    fireEvent.change(screen.getByLabelText(/^Selfie/), { target: { files: [] } })

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(
      await screen.findByText('Please upload both your ID photo and a selfie.')
    ).toBeInTheDocument()
  })
})
