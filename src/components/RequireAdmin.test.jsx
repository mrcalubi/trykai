import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequireAdmin from './RequireAdmin'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'

vi.mock('../lib/supabase')

function givenAdminFlag(value) {
  supabase.rpc.mockResolvedValue({ data: [{ is_admin: value }], error: null })
}

function renderGate() {
  return renderWithRouter(
    <RequireAdmin>
      <p>Internal review tools</p>
    </RequireAdmin>
  )
}

beforeEach(() => {
  supabase.__reset()
})

describe('RequireAdmin', () => {
  it('renders the tools for an admin', async () => {
    givenAdminFlag(true)
    renderGate()

    expect(await screen.findByText('Internal review tools')).toBeInTheDocument()
  })

  it('refuses a signed-in host who is not an admin', async () => {
    givenAdminFlag(false)
    renderGate()

    expect(await screen.findByText('This page is for the TryKai team only.')).toBeInTheDocument()
    expect(screen.queryByText('Internal review tools')).not.toBeInTheDocument()
  })

  it('refuses when the check itself fails, rather than falling open', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    renderGate()

    expect(await screen.findByText('This page is for the TryKai team only.')).toBeInTheDocument()
  })

  it('reads is_admin from the caller-scoped function, not a users select', async () => {
    givenAdminFlag(true)
    renderGate()
    await screen.findByText('Internal review tools')

    expect(supabase.rpc).toHaveBeenCalledWith('my_verification')
    expect(supabase.__calls('users', 'select')).toHaveLength(0)
  })
})
