import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ResetPassword from './ResetPassword'
import { supabase, authCallbackFromUrl } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

function renderResetPassword() {
  return renderWithRouter(<ResetPassword />, {
    route: '/reset-password',
    path: '/reset-password',
  })
}

function givenRecoveryFromUrl() {
  authCallbackFromUrl.type = 'recovery'
}

beforeEach(() => {
  supabase.__reset()
})

describe('Reset password', () => {
  it('shows the form when this is a recovery visit', async () => {
    givenRecoveryFromUrl()
    renderResetPassword()

    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toHaveAttribute('minLength', '6')
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('minLength', '6')
  })

  it('does not show the form to a signed-in user without a recovery', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: makeAuthSession() },
      error: null,
    })
    renderResetPassword()

    expect(
      await screen.findByText('This reset link has expired or is invalid.')
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })

  it('shows the expired message when the hash has an error', () => {
    authCallbackFromUrl.error_code = 'otp_expired'
    authCallbackFromUrl.error = 'access_denied'
    renderResetPassword()

    expect(screen.getByText('This reset link has expired or is invalid.')).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('blocks submit when the passwords do not match', async () => {
    givenRecoveryFromUrl()
    const { user } = renderResetPassword()

    await user.type(screen.getByLabelText('New password'), 'hunter22')
    await user.type(screen.getByLabelText('Confirm password'), 'different')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('calls updateUser and goes to bookings when the passwords match', async () => {
    givenRecoveryFromUrl()
    const { user, currentPath } = renderResetPassword()

    await user.type(screen.getByLabelText('New password'), 'hunter22')
    await user.type(screen.getByLabelText('Confirm password'), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => expect(supabase.auth.updateUser).toHaveBeenCalledTimes(1))
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'hunter22' })
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    await waitFor(() => expect(currentPath()).toBe('/bookings'))
  })

  it('shows a recovery form when PASSWORD_RECOVERY fires after mount', async () => {
    const { user } = renderResetPassword()

    expect(screen.getByText('Checking your reset link…')).toBeInTheDocument()

    await act(async () => {
      supabase.__emitAuth('PASSWORD_RECOVERY', makeAuthSession())
    })

    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    await user.type(screen.getByLabelText('New password'), 'hunter22')
    await user.type(screen.getByLabelText('Confirm password'), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() =>
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'hunter22' })
    )
  })

  it('surfaces an updateUser error on the form', async () => {
    givenRecoveryFromUrl()
    supabase.auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Password should be at least 6 characters' },
    })
    const { user, currentPath } = renderResetPassword()

    await user.type(screen.getByLabelText('New password'), 'hunter22')
    await user.type(screen.getByLabelText('Confirm password'), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText('Password should be at least 6 characters')).toBeInTheDocument()
    expect(currentPath()).toBe('/reset-password')
  })
})
