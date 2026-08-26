import { screen, waitFor } from '@testing-library/react'
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

async function fillSignup(user, { name = 'Mei Ling', email = 'kai@example.com', password = 'hunter22' } = {}) {
  await user.type(screen.getByLabelText('Full name'), name)
  await fillCredentials(user, { email, password })
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
  })

  it('switches to sign-up mode and back', async () => {
    const { user } = renderLogin()

    await switchToSignup(user)
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('requires a password of at least six characters', () => {
    renderLogin()
    expect(screen.getByLabelText('Password')).toHaveAttribute('minLength', '6')
  })

  it('marks the full name field as required on the signup form', async () => {
    const { user } = renderLogin()
    await switchToSignup(user)
    expect(screen.getByLabelText('Full name')).toBeRequired()
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

    expect(await screen.findByRole('button', { name: 'Please wait…' })).toBeDisabled()
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
    await fillSignup(user, { name: '  Mei Ling  ', email: 'mei@example.com' })

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => expect(supabase.auth.signUp).toHaveBeenCalledTimes(1))
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'mei@example.com',
      password: 'hunter22',
      options: { data: { full_name: 'Mei Ling' } },
    })
    expect(supabase.__calls('users', 'insert')).toHaveLength(0)
  })

  it('requires a full name before calling signup', async () => {
    givenSignupSucceeds()
    const { user } = renderLogin()
    await switchToSignup(user)
    await user.type(screen.getByLabelText('Full name'), '   ')
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Please enter your full name.')).toBeInTheDocument()
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

  it('asks the user to confirm their email when no session is returned', async () => {
    givenSignupSucceeds({ session: null })
    const { user, currentPath } = renderLogin()
    await switchToSignup(user)
    await fillSignup(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(
      await screen.findByText('Check your email to confirm your account, then log in.')
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(currentPath()).toBe('/login')
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
