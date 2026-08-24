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
  })
}

async function fillCredentials(user, { email = 'kai@example.com', password = 'hunter22' } = {}) {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
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

  it('creates the auth user and a matching profile row', async () => {
    givenSignupSucceeds()
    const { user } = renderLogin()
    await switchToSignup(user)
    await user.type(screen.getByLabelText('Full name'), '  Mei Ling  ')
    await fillCredentials(user, { email: 'mei@example.com' })

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => expect(supabase.__calls('users', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'insert').payload).toEqual({
      id: 'new-user',
      email: 'mei@example.com',
      full_name: 'Mei Ling',
    })
  })

  it('stores a null name rather than an empty string', async () => {
    givenSignupSucceeds()
    const { user } = renderLogin()
    await switchToSignup(user)
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => expect(supabase.__calls('users', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('users', 'insert').payload.full_name).toBeNull()
  })

  it('navigates straight in when the signup returns a session', async () => {
    givenSignupSucceeds()
    const { user, currentPath } = renderLogin({ from: '/dashboard' })
    await switchToSignup(user)
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => expect(currentPath()).toBe('/dashboard'))
  })

  it('asks the user to confirm their email when no session is returned', async () => {
    givenSignupSucceeds({ session: null })
    const { user, currentPath } = renderLogin()
    await switchToSignup(user)
    await fillCredentials(user)

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
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('User already registered')).toBeInTheDocument()
    expect(supabase.__calls('users', 'insert')).toHaveLength(0)
  })

  it('reports a generic failure when no user comes back', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null })
    const { user } = renderLogin()
    await switchToSignup(user)
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Signup failed. Please try again.')).toBeInTheDocument()
  })

  it('surfaces a failure to write the profile row', async () => {
    givenSignupSucceeds()
    supabase.__on('users', 'insert', { error: { message: 'duplicate key' } })
    const { user, currentPath } = renderLogin()
    await switchToSignup(user)
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('duplicate key')).toBeInTheDocument()
    expect(currentPath()).toBe('/login')
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
