import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SingpassReturn from './SingpassReturn'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

function renderAt(search) {
  return renderWithRouter(<SingpassReturn />, {
    route: `/verify-identity/singpass${search}`,
    path: '/verify-identity/singpass',
  })
}

function givenCallback(result) {
  supabase.functions.invoke.mockImplementation(async (name) =>
    name === 'singpass-callback' ? result : { data: null, error: null }
  )
}

beforeEach(() => {
  supabase.__reset()
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: 'host-9' } }) },
    error: null,
  })
})

describe('SingpassReturn', () => {
  it('passes the query to singpass-callback once and shows Under review', async () => {
    givenCallback({ data: { ok: true, status: 'pending' }, error: null })
    renderAt('?code=abc&state=s1&iss=https%3A%2F%2Fstg-id.singpass.gov.sg%2Ffapi')

    expect(await screen.findByRole('heading', { name: 'Under review' })).toBeInTheDocument()
    expect(screen.getByText(/Singpass confirmed who you are/)).toBeInTheDocument()
    const calls = supabase.functions.invoke.mock.calls.filter(([name]) => name === 'singpass-callback')
    expect(calls).toHaveLength(1)
    expect(calls[0][1].body).toEqual({
      query: '?code=abc&state=s1&iss=https%3A%2F%2Fstg-id.singpass.gov.sg%2Ffapi',
    })
    expect(calls[0][1].headers.Authorization).toMatch(/^Bearer /)
  })

  it('takes the code out of the address bar', async () => {
    givenCallback({ data: { ok: true }, error: null })
    const { currentPath } = renderAt('?code=abc&state=s1')

    await screen.findByRole('heading', { name: 'Under review' })
    expect(currentPath()).toBe('/verify-identity/singpass')
  })

  it("shows the function's reason and a way back when it fails", async () => {
    givenCallback({
      data: { error: 'This Singpass is already linked to another TryKai account.' },
      error: null,
    })
    renderAt('?code=abc&state=s1')

    expect(await screen.findByRole('heading', { name: "Singpass didn't go through" })).toBeInTheDocument()
    expect(screen.getByText('This Singpass is already linked to another TryKai account.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/verify-identity')
  })

  it('uses a plain line when no reason comes back', async () => {
    givenCallback({ data: null, error: new Error('network') })
    renderAt('?code=abc&state=s1')

    expect(
      await screen.findByText(/We could not confirm your identity with Singpass/)
    ).toBeInTheDocument()
  })

  it('sends a visit without a Singpass response back to the verify page', async () => {
    const { currentPath } = renderAt('')

    await waitFor(() => expect(currentPath()).toBe('/verify-identity'))
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('shows a checking state while it waits', async () => {
    supabase.functions.invoke.mockImplementation(() => new Promise(() => {}))
    renderAt('?code=abc&state=s1')

    expect(await screen.findByRole('heading', { name: 'Checking with Singpass' })).toBeInTheDocument()
  })
})
