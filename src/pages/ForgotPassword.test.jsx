import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ForgotPassword from './ForgotPassword'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'

vi.mock('../lib/supabase')

function renderForgotPassword() {
  return renderWithRouter(<ForgotPassword />, {
    route: '/forgot-password',
    path: '/forgot-password',
  })
}

async function fillEmail(user, email = 'kai@example.com') {
  await user.type(screen.getByLabelText('Email'), email)
}

beforeEach(() => {
  supabase.__reset()
})

describe('Forgot password request', () => {
  it('calls resetPasswordForEmail with the reset-password redirect', async () => {
    const { user } = renderForgotPassword()
    await fillEmail(user)

    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1))
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('kai@example.com', {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    expect(
      await screen.findByText("If an account exists for that email, we've sent a reset link.")
    ).toBeInTheDocument()
  })

  it('shows the same confirmation when the email is unknown', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: 'User not found', status: 400 },
    })
    const { user } = renderForgotPassword()
    await fillEmail(user)

    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(
      await screen.findByText("If an account exists for that email, we've sent a reset link.")
    ).toBeInTheDocument()
    expect(screen.queryByText('User not found')).not.toBeInTheDocument()
  })

  it('surfaces a rate-limit error', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: {
        message: 'For security purposes, you can only request this after 60 seconds.',
        status: 429,
        code: 'over_email_send_rate_limit',
      },
    })
    const { user } = renderForgotPassword()
    await fillEmail(user)

    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(
      await screen.findByText('For security purposes, you can only request this after 60 seconds.')
    ).toBeInTheDocument()
    expect(
      screen.queryByText("If an account exists for that email, we've sent a reset link.")
    ).not.toBeInTheDocument()
  })

  it('surfaces a network failure', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: 'Failed to fetch', name: 'AuthRetryableFetchError' },
    })
    const { user } = renderForgotPassword()
    await fillEmail(user)

    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument()
  })
})
