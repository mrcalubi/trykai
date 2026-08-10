import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VerifyIdentity from './VerifyIdentity'
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

function givenStatus(status) {
  supabase.__on('users', 'select', { data: { verification_status: status }, error: null })
}

function renderPage(options = {}) {
  return renderWithRouter(<VerifyIdentity />, {
    route: '/verify-identity',
    path: '/verify-identity',
    ...options,
  })
}

function attach(label, file) {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })
}

function imageFile(name) {
  return new File(['binary'], name, { type: 'image/png' })
}

async function renderFormWithBothPhotos() {
  const utils = renderPage()
  await screen.findByRole('heading', { name: 'Verify your identity' })
  attach(/^NRIC or passport photo/, imageFile('id.png'))
  attach(/^Selfie/, imageFile('selfie.png'))
  return utils
}

beforeEach(() => {
  supabase.__reset()
  givenSignedIn()
  givenStatus('unverified')
})

describe('VerifyIdentity access control', () => {
  it('sends signed-out visitors to log in', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { currentPath, currentState } = renderPage()

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(currentState().from.pathname).toBe('/verify-identity')
  })

  it('shows the upload form to an unverified host', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Verify your identity' })).toBeInTheDocument()
  })

  it('treats a missing verification record as unverified', async () => {
    supabase.__on('users', 'select', { data: null, error: null })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Verify your identity' })).toBeInTheDocument()
  })

  it('lets a rejected host try again', async () => {
    givenStatus('rejected')
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Verify your identity' })).toBeInTheDocument()
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

  it('moves the host into the pending queue', async () => {
    const { user } = await renderFormWithBothPhotos()

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    await waitFor(() => expect(supabase.__calls('users', 'update')).toHaveLength(1))
    const call = supabase.__lastCall('users', 'update')
    expect(call.payload).toEqual({
      id_photo_url: 'host-9/id-photo.jpg',
      selfie_url: 'host-9/selfie.jpg',
      verification_status: 'pending',
    })
    expect(call.filters).toContainEqual({ method: 'eq', column: 'id', value: USER_ID })
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
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
  })

  it('stops when the selfie upload fails', async () => {
    const { user } = await renderFormWithBothPhotos()
    const bucket = supabase.__bucket('verification-docs')
    bucket.upload
      .mockResolvedValueOnce({ data: { path: 'ok' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'selfie rejected' } })

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByText('selfie rejected')).toBeInTheDocument()
    expect(supabase.__calls('users', 'update')).toHaveLength(0)
  })

  it('reports a failure to record the pending status', async () => {
    supabase.__on('users', 'update', { error: { message: 'update blocked' } })
    const { user } = await renderFormWithBothPhotos()

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByText('update blocked')).toBeInTheDocument()
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
