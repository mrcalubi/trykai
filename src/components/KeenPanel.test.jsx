import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import KeenPanel from './KeenPanel'

vi.mock('../lib/supabase')

const LISTING = '0b6c2f1e-8d1a-4f43-9a7e-2c5d8e9f1a2b'

function signedIn() {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'token', user: { id: 'guest-1' } } },
    error: null,
  })
}

function rpcReturns(map) {
  supabase.rpc.mockImplementation(async (name) => ({ data: map[name] ?? null, error: null }))
}

function renderPanel(props = {}) {
  return renderWithRouter(
    <KeenPanel listingId={LISTING} hostName="Mei Ling" viewerId={null} {...props} />,
    { route: `/listings/${LISTING}`, path: '/listings/:id' },
  )
}

beforeEach(() => {
  supabase.__reset()
})

describe('KeenPanel', () => {
  it('says there are no dates and offers I\'m keen with optional chips', async () => {
    renderPanel()
    expect(screen.getByText('No dates yet')).toBeInTheDocument()
    expect(screen.getByText("Keen? We'll nudge Mei Ling to open one.")).toBeInTheDocument()
    for (const label of ['Weekdays', 'Weekends', 'Morning', 'Afternoon', 'Evening']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
    expect(screen.getByRole('button', { name: "I'm keen" })).toBeEnabled()
  })

  it('shows the keen count from 2 people', async () => {
    rpcReturns({ listing_keen_counts: [{ listing_id: LISTING, keen_count: 3 }] })
    renderPanel()
    expect(await screen.findByText('3 keen')).toBeInTheDocument()
  })

  it('hides a count of 1', async () => {
    rpcReturns({ listing_keen_counts: [{ listing_id: LISTING, keen_count: 1 }] })
    renderPanel()
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('listing_keen_counts', { p_listing_ids: [LISTING] }))
    expect(screen.queryByText('1 keen')).not.toBeInTheDocument()
  })

  it('sends a signed-out guest to log in first', async () => {
    const { user, currentPath } = renderPanel()
    await user.click(screen.getByRole('button', { name: "I'm keen" }))
    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('sends the chosen days, times and group size, then shows the nudge', async () => {
    signedIn()
    rpcReturns({ listing_keen_counts: [{ listing_id: LISTING, keen_count: 1 }] })
    supabase.functions.invoke.mockResolvedValue({ data: { keen: true }, error: null })
    const { user } = renderPanel({ viewerId: 'guest-1' })

    await user.click(screen.getByRole('button', { name: 'Weekends' }))
    await user.click(screen.getByRole('button', { name: 'Evening' }))
    await user.click(screen.getByRole('button', { name: 'Morning' }))
    await user.click(screen.getByRole('button', { name: 'Morning' }))
    expect(screen.getByRole('button', { name: 'Weekends' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'More people' }))
    await user.click(screen.getByRole('button', { name: "I'm keen" }))

    expect(supabase.functions.invoke).toHaveBeenCalledWith('listing-interest', {
      body: { listing_id: LISTING, days: ['weekend'], times: ['evening'], group_size: 2 },
      headers: { Authorization: 'Bearer token' },
    })
    expect(await screen.findByText("Mei Ling's been nudged")).toBeInTheDocument()
    expect(screen.getByText("We'll email you when a date opens.")).toBeInTheDocument()
    expect(screen.getByText('2 keen')).toBeInTheDocument()
  })

  it('stops the group size at 1 and 10', async () => {
    const { user } = renderPanel()
    expect(screen.getByRole('button', { name: 'Fewer people' })).toBeDisabled()
    for (let i = 0; i < 9; i += 1) await user.click(screen.getByRole('button', { name: 'More people' }))
    expect(screen.getByRole('button', { name: 'More people' })).toBeDisabled()
  })

  it('remembers an existing interest and lets the guest withdraw it', async () => {
    signedIn()
    rpcReturns({
      my_listing_interest: [{ days: ['weekday'], times: [], group_size: 1 }],
      listing_keen_counts: [{ listing_id: LISTING, keen_count: 2 }],
    })
    const { user } = renderPanel({ viewerId: 'guest-1' })

    expect(await screen.findByText("Mei Ling's been nudged")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Not keen anymore' }))
    expect(supabase.rpc).toHaveBeenCalledWith('clear_my_listing_interest', { p_listing_id: LISTING })
    expect(await screen.findByRole('button', { name: "I'm keen" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Weekdays' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says so when sending fails', async () => {
    signedIn()
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { user } = renderPanel({ viewerId: 'guest-1' })
    await user.click(screen.getByRole('button', { name: "I'm keen" }))
    expect(await screen.findByText('Could not send that. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText("Mei Ling's been nudged")).not.toBeInTheDocument()
  })

  it('says so when withdrawing fails', async () => {
    signedIn()
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'my_listing_interest') return { data: [{ days: [], times: [], group_size: 1 }], error: null }
      if (name === 'clear_my_listing_interest') return { data: null, error: { message: 'no' } }
      return { data: null, error: null }
    })
    const { user } = renderPanel({ viewerId: 'guest-1' })
    await user.click(await screen.findByRole('button', { name: 'Not keen anymore' }))
    expect(await screen.findByText('Could not send that. Please try again.')).toBeInTheDocument()
  })

  it('falls back to "the host" without a name', () => {
    renderPanel({ hostName: '' })
    expect(screen.getByText("Keen? We'll nudge the host to open one.")).toBeInTheDocument()
  })
})
