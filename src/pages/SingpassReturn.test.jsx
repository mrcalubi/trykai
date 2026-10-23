import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SingpassReturn from './SingpassReturn'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

const REVIEW = { name: 'TAN MEI LING', dob: '1998-05-17', mobile: '+6597399245' }

function renderAt(search) {
  return renderWithRouter(<SingpassReturn />, {
    route: `/verify-identity/singpass${search}`,
    path: '/verify-identity/singpass',
  })
}

/** Routes the exchange, confirm and cancel calls to their own results. */
function givenCallback({ exchange, confirm = { data: { ok: true, status: 'pending' }, error: null } } = {}) {
  supabase.functions.invoke.mockImplementation(async (name, options) => {
    if (name !== 'singpass-callback') return { data: null, error: null }
    if (options?.body?.action === 'confirm') return confirm
    if (options?.body?.action === 'cancel') return { data: { ok: true, cancelled: true }, error: null }
    return exchange ?? { data: { ok: true, review: REVIEW, state: 's1' }, error: null }
  })
}

function calls(action) {
  return supabase.functions.invoke.mock.calls.filter(
    ([name, options]) => name === 'singpass-callback' && options?.body?.action === action
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
  it('passes the query to singpass-callback once, then shows the details read-only', async () => {
    givenCallback()
    renderAt('?code=abc&state=s1&iss=https%3A%2F%2Fstg-id.singpass.gov.sg%2Ffapi')

    expect(await screen.findByRole('heading', { name: 'Check your details' })).toBeInTheDocument()
    expect(screen.getByText('TAN MEI LING')).toBeInTheDocument()
    expect(screen.getByText('17 May 1998')).toBeInTheDocument()
    expect(screen.getByText('+6597399245')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    const exchange = supabase.functions.invoke.mock.calls.filter(([, options]) => options?.body?.query)
    expect(exchange).toHaveLength(1)
    expect(exchange[0][1].body).toEqual({
      query: '?code=abc&state=s1&iss=https%3A%2F%2Fstg-id.singpass.gov.sg%2Ffapi',
    })
    expect(exchange[0][1].headers.Authorization).toMatch(/^Bearer /)
  })

  it('says when Singpass has no mobile number', async () => {
    givenCallback({ exchange: { data: { ok: true, review: { ...REVIEW, mobile: null }, state: 's1' }, error: null } })
    renderAt('?code=abc&state=s1')

    expect(await screen.findByText('None registered with Singpass')).toBeInTheDocument()
  })

  it('submits only after the host confirms', async () => {
    givenCallback()
    const { user } = renderAt('?code=abc&state=s1')
    await screen.findByRole('heading', { name: 'Check your details' })
    expect(calls('confirm')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Confirm and submit' }))

    expect(await screen.findByRole('heading', { name: 'Under review' })).toBeInTheDocument()
    expect(calls('confirm')[0][1].body).toEqual({ action: 'confirm', state: 's1' })
  })

  it('throws the details away when the host cancels', async () => {
    givenCallback()
    const { user, currentPath } = renderAt('?code=abc&state=s1')
    await screen.findByRole('heading', { name: 'Check your details' })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(currentPath()).toBe('/verify-identity'))
    expect(calls('cancel')[0][1].body).toEqual({ action: 'cancel', state: 's1' })
  })

  it('takes the code out of the address bar', async () => {
    givenCallback()
    const { currentPath } = renderAt('?code=abc&state=s1')

    await screen.findByRole('heading', { name: 'Check your details' })
    expect(currentPath()).toBe('/verify-identity/singpass')
  })

  it("shows the function's reason when Singpass refuses, such as under 18", async () => {
    givenCallback({ exchange: { data: { error: 'Hosts on TryKai must be 18 or older.' }, error: null } })
    renderAt('?code=abc&state=s1')

    expect(await screen.findByRole('heading', { name: "Singpass didn't go through" })).toBeInTheDocument()
    expect(screen.getByText('Hosts on TryKai must be 18 or older.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/verify-identity')
  })

  it('shows the reason when confirming fails', async () => {
    givenCallback({
      confirm: { data: { error: 'This Singpass is already linked to another TryKai account.' }, error: null },
    })
    const { user } = renderAt('?code=abc&state=s1')
    await screen.findByRole('heading', { name: 'Check your details' })

    await user.click(screen.getByRole('button', { name: 'Confirm and submit' }))

    expect(
      await screen.findByText('This Singpass is already linked to another TryKai account.')
    ).toBeInTheDocument()
  })

  it('uses a plain line when no reason comes back', async () => {
    givenCallback({ exchange: { data: null, error: new Error('network') } })
    renderAt('?code=abc&state=s1')

    expect(await screen.findByText(/We could not confirm your identity with Singpass/)).toBeInTheDocument()
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
