import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession, makeUser } from '../test/fixtures'

vi.mock('../lib/supabase')

function renderLogin({ from } = {}) {
  return renderWithRouter(<Login />, {
    route: { pathname: '/login', state: from ? { from: { pathname: from } } : null },
    path: '/login',
  })
}

async function fillCredentials(user, { email = 'kai@example.com', password = 'hunter22' } = {}) {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
}

async function fillSignup(
  user,
  { name = 'Mei Ling', displayName = 'Mei', email = 'kai@example.com', password = 'hunter22' } = {}
) {
  await user.type(screen.getByLabelText('Full name'), name)
  await user.type(screen.getByLabelText('What should we call you?'), displayName)
  await fillCredentials(user, { email, password })
  await user.click(screen.getByRole('checkbox', { name: /18 or older/ }))
}

async function switchToSignup(user) {
  await user.click(screen.getByRole('button', { name: 'Sign up' }))
}

beforeEach(() => {
  supabase.__reset()
})

describe('Login form', () => {
  it('starts in log-in mode', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('What should we call you?')).not.toBeInTheDocument()

    const email = screen.getByLabelText('Email')
    const password = screen.getByLabelText('Password')
    expect(email).toHaveClass('ui-input')
    expect(email.closest('.ui-field')).toHaveClass('ui-field--floating')
    expect(password).toHaveClass('ui-input')
    expect(password.closest('.ui-field')).toHaveClass('ui-field--floating')
    expect(password).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hold to peek at password' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })

  it('switches to sign-up mode and back', async () => {
    const { user } = renderLogin()

    await switchToSignup(user)
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Full name').closest('.ui-field')).toHaveClass('ui-field--floating')
    expect(screen.getByLabelText('What should we call you?').closest('.ui-field')).toHaveClass(
      'ui-field--floating'
    )
    expect(screen.getByText('Shown on your profile and reviews.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email').closest('.ui-field')).toHaveClass('ui-field--floating')
    expect(screen.getByLabelText('Password').closest('.ui-field')).toHaveClass('ui-field--floating')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
    expect(screen.getByLabelText('Email').closest('.ui-field')).toHaveClass('ui-field--floating')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })

  it('requires a password of at least six characters', () => {
    renderLogin()
    expect(screen.getByLabelText('Password')).toHaveAttribute('minLength', '6')
  })

  it('toggles the password field between masked and plain text', async () => {
    const { user } = renderLogin()
    const password = screen.getByLabelText('Password')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('marks the full name and display name fields as required on the signup form', async () => {
    const { user } = renderLogin()
    await switchToSignup(user)
    expect(screen.getByLabelText('Full name')).toBeRequired()
    expect(screen.getByLabelText('What should we call you?')).toBeRequired()
    expect(screen.getByLabelText('What should we call you?')).toHaveAttribute('maxLength', '40')
  })

  it('keeps Sign up disabled until the terms checkbox is ticked', async () => {
    const { user } = renderLogin()
    await switchToSignup(user)

    expect(screen.getByRole('button', { name: 'Sign up' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /18 or older/ })).toBeRequired()
    await user.click(screen.getByRole('checkbox', { name: /18 or older/ }))
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeEnabled()
  })

  it('links Terms and Privacy Policy from the signup checkbox', async () => {
    const { user } = renderLogin()
    await switchToSignup(user)

    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })
})

describe('Logging in', () => {
  it('signs in with the entered credentials and lands on the home page', async () => {
    const { user, currentPath } = renderLogin()
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: 'kai@example.com',
      password: 'hunter22',
    })
    await waitFor(() => expect(currentPath()).toBe('/'))
  })

  it('returns the user to the page that sent them to log in', async () => {
    const { user, currentPath } = renderLogin({ from: '/create-listing' })
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(currentPath()).toBe('/create-listing'))
  })

  it('shows the auth error and stays on the form', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    })
    const { user, currentPath } = renderLogin()
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument()
    expect(currentPath()).toBe('/login')
  })

  it('disables the submit button while the request is in flight', async () => {
    let release
    supabase.auth.signInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ data: {}, error: null })
      })
    )
    const { user } = renderLogin()
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('button', { name: 'Please wait' })).toBeDisabled()
    release()
  })
})

describe('Signing up', () => {
  function givenSignupSucceeds({ session = makeAuthSession() } = {}) {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: makeUser({ id: 'new-user' }), session },
      error: null,
    })
  }

  it('sends the trimmed name in signup metadata and does not insert a profile row', async () => {
    givenSignupSucceeds()
    const { user } = renderLogin()
    await switchToSignup(user)
    await fillSignup(user, { name: '  Mei Ling  ', displayName: '  Mei  ', email: 'mei@example.com' })

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => expect(supabase.auth.signUp).toHaveBeenCalledTimes(1))
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'mei@example.com',
      password: 'hunter22',
      options: {
        data: { full_name: 'Mei Ling', display_name: 'Mei', terms_accepted: true },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    expect(supabase.__calls('users', 'insert')).toHaveLength(0)
  })

  it('requires a full name before calling signup', async () => {
    givenSignupSucceeds()
    const { user } = renderLogin()
    await switchToSignup(user)
    await user.type(screen.getByLabelText('Full name'), '   ')
    await user.type(screen.getByLabelText('What should we call you?'), 'Mei')
    await fillCredentials(user)
    await user.click(screen.getByRole('checkbox', { name: /18 or older/ }))

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Please enter your full name.')).toBeInTheDocument()
    expect(supabase.auth.signUp).not.toHaveBeenCalled()
  })

  it('requires a display name before calling signup', async () => {
    givenSignupSucceeds()
    const { user } = renderLogin()
    await switchToSignup(user)
    await user.type(screen.getByLabelText('Full name'), 'Mei Ling')
    await user.type(screen.getByLabelText('What should we call you?'), '   ')
    await fillCredentials(user)
    await user.click(screen.getByRole('checkbox', { name: /18 or older/ }))

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Please enter a display name.')).toBeInTheDocument()
    expect(supabase.auth.signUp).not.toHaveBeenCalled()
  })

  it('navigates straight in when the signup returns a session', async () => {
    givenSignupSucceeds()
    const { user, currentPath } = renderLogin({ from: '/dashboard' })
    await switchToSignup(user)
    await fillSignup(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => expect(currentPath()).toBe('/dashboard'))
  })

  it('asks for the emailed code when no session is returned', async () => {
    givenSignupSucceeds({ session: null })
    const { user, currentPath } = renderLogin({ from: '/listings/abc' })
    await switchToSignup(user)
    await fillSignup(user, { email: 'mei@example.com' })

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText('mei@example.com')).toBeInTheDocument()
    const codeInput = screen.getByLabelText('Code')
    expect(codeInput).toHaveAttribute('inputmode', 'numeric')
    expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code')
    expect(screen.getByRole('button', { name: 'Send a new code in 60s' })).toBeDisabled()
    expect(supabase.auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(
      `${window.location.origin}/listings/abc`
    )
    expect(currentPath()).toBe('/login')
  })

  it('tells someone with an existing account to log in instead', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: makeUser({ id: 'fake', identities: [] }), session: null },
      error: null,
    })
    const { user } = renderLogin()
    await switchToSignup(user)
    await fillSignup(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(
      await screen.findByText('There is already an account with this email. Log in instead.')
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument()
  })

  it('surfaces a signup rejection from the auth service', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: {},
      error: { message: 'User already registered' },
    })
    const { user } = renderLogin()
    await switchToSignup(user)
    await fillSignup(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('User already registered')).toBeInTheDocument()
    expect(supabase.__calls('users', 'insert')).toHaveLength(0)
  })

  it('reports a generic failure when no user comes back', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null })
    const { user } = renderLogin()
    await switchToSignup(user)
    await fillSignup(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Signup failed. Please try again.')).toBeInTheDocument()
  })

  it('clears a previous error when switching modes', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    })
    const { user } = renderLogin()
    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await screen.findByText('Invalid login credentials')

    await switchToSignup(user)

    expect(screen.queryByText('Invalid login credentials')).not.toBeInTheDocument()
  })
})

async function waitOutCooldown() {
  for (let i = 0; i < 61; i += 1) {
    await act(() => vi.advanceTimersByTimeAsync(1000))
  }
}

describe('Confirming the email', () => {
  async function reachCodeStep({ from } = {}) {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: makeUser({ id: 'new-user' }), session: null },
      error: null,
    })
    const rendered = renderLogin({ from })
    await switchToSignup(rendered.user)
    await fillSignup(rendered.user, { email: 'mei@example.com' })
    await rendered.user.click(screen.getByRole('button', { name: 'Sign up' }))
    await screen.findByLabelText('Code')
    return rendered
  }

  it('signs in with the code and goes where the guest was heading', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({
      data: { user: makeUser(), session: makeAuthSession() },
      error: null,
    })
    const { user, currentPath } = await reachCodeStep({ from: '/listings/abc' })

    await user.type(screen.getByLabelText('Code'), '12 34-56')
    expect(screen.getByLabelText('Code')).toHaveValue('123456')
    await user.click(screen.getByRole('button', { name: 'Confirm email' }))

    await waitFor(() => expect(currentPath()).toBe('/listings/abc'))
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'mei@example.com',
      token: '123456',
      type: 'email',
    })
  })

  it('falls back to the signup type when the email type is refused', async () => {
    supabase.auth.verifyOtp
      .mockResolvedValueOnce({ data: {}, error: { message: 'Token has expired or is invalid' } })
      .mockResolvedValueOnce({ data: { user: makeUser(), session: makeAuthSession() }, error: null })
    const { user, currentPath } = await reachCodeStep()

    await user.type(screen.getByLabelText('Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Confirm email' }))

    await waitFor(() => expect(currentPath()).toBe('/'))
    expect(supabase.auth.verifyOtp.mock.calls.map((call) => call[0].type)).toEqual(['email', 'signup'])
  })

  it('explains a wrong or expired code and stays on the step', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({
      data: {},
      error: { message: 'Token has expired or is invalid', code: 'otp_expired' },
    })
    const { user, currentPath } = await reachCodeStep()

    await user.type(screen.getByLabelText('Code'), '999999')
    await user.click(screen.getByRole('button', { name: 'Confirm email' }))

    expect(
      await screen.findByText(
        "That code didn't work. Check it against the latest email, or send a new one."
      )
    ).toBeInTheDocument()
    expect(currentPath()).toBe('/login')
  })

  it('asks for the whole code before calling the server', async () => {
    const { user } = await reachCodeStep()

    await user.type(screen.getByLabelText('Code'), '123')
    await user.click(screen.getByRole('button', { name: 'Confirm email' }))

    expect(await screen.findByText('Enter the 6-digit code from the email.')).toBeInTheDocument()
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('sends a new code once the cooldown has passed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { user } = await reachCodeStep()
      await waitOutCooldown()

      await user.click(await screen.findByRole('button', { name: 'Send a new code' }))

      expect(await screen.findByText('New code sent. Use the latest email.')).toBeInTheDocument()
      expect(supabase.auth.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'mei@example.com',
        options: { emailRedirectTo: `${window.location.origin}/` },
      })
      expect(screen.getByRole('button', { name: 'Send a new code in 60s' })).toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the wait message when Supabase rate-limits a resend', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      supabase.auth.resend.mockResolvedValue({
        data: {},
        error: { status: 429, message: 'For security purposes, you can only request this after 30 seconds.' },
      })
      const { user } = await reachCodeStep()
      await waitOutCooldown()

      await user.click(await screen.findByRole('button', { name: 'Send a new code' }))

      expect(
        await screen.findByText('We just sent one. Please wait a minute before asking again.')
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves on when the link was confirmed in another tab', async () => {
    const { currentPath } = await reachCodeStep({ from: '/bookings' })

    act(() => supabase.__emitAuth('SIGNED_IN', makeAuthSession()))

    await waitFor(() => expect(currentPath()).toBe('/bookings'))
  })

  it('lets the guest start again with a different email', async () => {
    const { user } = await reachCodeStep()

    await user.click(screen.getByRole('button', { name: 'Start again' }))

    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('mei@example.com')
  })
})

describe('Logging in before confirming', () => {
  it('sends a fresh code and asks for it', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Email not confirmed', code: 'email_not_confirmed' },
    })
    const { user } = renderLogin({ from: '/hosting' })
    await fillCredentials(user, { email: 'mei@example.com' })

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByLabelText('Code')).toBeInTheDocument()
    expect(screen.getByText("Confirm your email first. We've sent you a new code.")).toBeInTheDocument()
    expect(supabase.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'mei@example.com',
      options: { emailRedirectTo: `${window.location.origin}/hosting` },
    })
  })

  it('still asks for the code when the resend is refused', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Email not confirmed' },
    })
    supabase.auth.resend.mockResolvedValue({ data: {}, error: { status: 429, message: 'rate limit' } })
    const { user } = renderLogin()
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(
      await screen.findByText('Confirm your email first. Use the code in the email we sent you.')
    ).toBeInTheDocument()
  })
})
