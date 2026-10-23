import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

async function openForm() {
  const utils = renderPage()
  await screen.findByLabelText(/^Passport or NRIC photo/)
  return utils
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
  const utils = await openForm()
  attach(/^Passport or NRIC photo/, imageFile('id.png'))
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
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
    const { currentPath } = renderPage()

    await waitFor(() => expect(currentPath()).toBe('/create-listing'))
    expect(screen.queryByRole('heading', { name: 'Identity verified' })).not.toBeInTheDocument()
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

describe('VerifyIdentity upload route', () => {
  it('leads with the upload form and never offers or starts a Stripe check', async () => {
    renderPage()

    expect(await screen.findByLabelText(/^Passport or NRIC photo/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^What would you like to teach\?/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Selfie/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stripe/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/never stores your ID/)).not.toBeInTheDocument()
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('tells the host the NRIC number can be covered', async () => {
    renderPage()

    expect(await screen.findByText(/On an NRIC you can cover the number/)).toBeInTheDocument()
  })

  it('says in the consent how long the photos are kept', async () => {
    renderPage()

    expect(
      await screen.findByText(/deleted\s+within 30 days; if I am, they are kept while my account is active/)
    ).toBeInTheDocument()
  })
})

describe('VerifyIdentity submission', () => {
  it('names everything still missing in one message', async () => {
    const { user } = await openForm()
    attach(/^Passport or NRIC photo/, imageFile('id.png'))

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(
      await screen.findByText(
        'Still needed: a selfie and a tick in the agreement box.'
      )
    ).toBeInTheDocument()
  })

  it('requires both documents', async () => {
    const { user } = await openForm()

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(
      await screen.findByText(/^Still needed: .*a photo of your ID|^Still needed: .*a selfie/)
    ).toBeInTheDocument()
    expect(supabase.__bucket('verification-docs').upload).not.toHaveBeenCalled()
  })

  it('requires a selfie alongside the ID', async () => {
    const { user } = await openForm()
    attach(/^Passport or NRIC photo/, imageFile('id.png'))

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(
      await screen.findByText(/^Still needed: .*a photo of your ID|^Still needed: .*a selfie/)
    ).toBeInTheDocument()
  })

  it('forgets a document the host clears out of the picker again', async () => {
    const { user } = await renderFormWithBothPhotos()
    fireEvent.change(screen.getByLabelText(/^Passport or NRIC photo/), { target: { files: [] } })

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(
      await screen.findByText(/^Still needed: .*a photo of your ID|^Still needed: .*a selfie/)
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
      await screen.findByText('Still needed: a tick in the agreement box.')
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
      await screen.findByText(/^Still needed: .*a photo of your ID|^Still needed: .*a selfie/)
    ).toBeInTheDocument()
  })
})

describe('VerifyIdentity with Singpass turned on', () => {
  const assign = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VITE_SINGPASS_ENABLED', 'true')
    assign.mockClear()
    vi.stubGlobal('location', { ...window.location, assign })
  })

  function givenSingpassStart(result) {
    supabase.functions.invoke.mockImplementation(async (name) =>
      name === 'singpass-start' ? result : { data: null, error: null }
    )
  }

  it('leads with Singpass and keeps the upload behind a link', async () => {
    renderPage()

    expect(await screen.findByRole('button', { name: 'Verify with Singpass' })).toBeInTheDocument()
    expect(screen.getByText(/Singpass shares your name, date of birth and mobile number with TryKai/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Passport or NRIC photo/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No Singpass? Upload your ID instead' })).toBeInTheDocument()
  })

  it('goes straight to Singpass, with nothing to fill in first', async () => {
    givenSingpassStart({ data: { url: 'https://stg-id.singpass.gov.sg/fapi/auth?x=1' }, error: null })
    const { user } = renderPage()
    await screen.findByRole('button', { name: 'Verify with Singpass' })
    expect(screen.queryByLabelText(/^What would you like to teach\?/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Verify with Singpass' }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://stg-id.singpass.gov.sg/fapi/auth?x=1'))
    const [name, options] = supabase.functions.invoke.mock.calls[0]
    expect(name).toBe('singpass-start')
    expect(options.body).toEqual({})
    expect(options.headers.Authorization).toMatch(/^Bearer /)
  })

  it("shows the function's reason when Singpass can't start", async () => {
    givenSingpassStart({
      data: { error: "Singpass isn't available right now. Please upload your ID instead." },
      error: null,
    })
    const { user } = renderPage()
    await screen.findByRole('button', { name: 'Verify with Singpass' })

    await user.click(screen.getByRole('button', { name: 'Verify with Singpass' }))

    expect(
      await screen.findByText("Singpass isn't available right now. Please upload your ID instead.")
    ).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('falls back to a generic line when no reason comes back', async () => {
    givenSingpassStart({ data: {}, error: null })
    const { user } = renderPage()
    await screen.findByRole('button', { name: 'Verify with Singpass' })

    await user.click(screen.getByRole('button', { name: 'Verify with Singpass' }))

    expect(
      await screen.findByText('Could not open Singpass. Please try again, or upload your ID instead.')
    ).toBeInTheDocument()
  })

  it('still lets someone without Singpass upload instead', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'No Singpass? Upload your ID instead' }))
    attach(/^Passport or NRIC photo/, imageFile('id.png'))
    attach(/^Selfie/, imageFile('selfie.png'))
    fireEvent.click(screen.getByRole('checkbox'))

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    await waitFor(() => expect(submitCalls()).toHaveLength(1))
    expect(submitCalls()[0][1]).not.toHaveProperty('p_teaching_plan')
  })
})
