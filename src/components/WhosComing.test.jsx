import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WhosComing from './WhosComing'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { COMPANION_SEND_HINT } from '../lib/companions'

vi.mock('../lib/supabase')
vi.mock('../lib/share', () => ({
  SHARE_NOTES: { copied: 'Link copied', shared: '' },
  shareOrCopy: vi.fn(async () => 'copied'),
}))

import { shareOrCopy } from '../lib/share'

const booking = {
  id: 'booking-1',
  guests_count: 3,
  sessions: { listings: { title: 'Beginner flower arranging' } },
}

describe('WhosComing', () => {
  beforeEach(() => {
    supabase.__reset()
    vi.mocked(shareOrCopy).mockClear()
  })

  it('lists the booker, claimed friends and open seats', () => {
    renderWithRouter(
      <WhosComing
        booking={booking}
        bookerName="Kai"
        companions={[{ user_id: 'u2', display_name: 'Mei Ling' }]}
        canRemove
      />,
    )
    expect(screen.getByRole('heading', { name: "Who's coming" })).toBeInTheDocument()
    expect(screen.getByText('2 of 3 seats')).toBeInTheDocument()
    expect(screen.getByText('Mei Ling')).toBeInTheDocument()
    expect(screen.getByText('Open seat')).toBeInTheDocument()
    expect(screen.getByText(COMPANION_SEND_HINT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('shares the join link from the RPC', async () => {
    supabase.rpc.mockImplementation(async (name) =>
      name === 'booking_join_link' ? { data: 'abcdef0123456789abcd', error: null } : { data: null, error: null },
    )
    const { user } = renderWithRouter(<WhosComing booking={booking} bookerName="Kai" companions={[]} canRemove />)

    await user.click(screen.getByRole('button', { name: 'Send your friends their seat' }))

    await waitFor(() => expect(shareOrCopy).toHaveBeenCalled())
    expect(supabase.rpc).toHaveBeenCalledWith('booking_join_link', { p_booking_id: 'booking-1' })
    expect(vi.mocked(shareOrCopy).mock.calls[0][0].url).toMatch(/\/join\/abcdef0123456789abcd$/)
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
  })

  it('says so when the link cannot be made', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'not_allowed' } })
    const { user } = renderWithRouter(<WhosComing booking={booking} bookerName="Kai" companions={[]} />)

    await user.click(screen.getByRole('button', { name: 'Send your friends their seat' }))

    expect(await screen.findByText("Couldn't make the link. Try again.")).toBeInTheDocument()
    expect(shareOrCopy).not.toHaveBeenCalled()
  })

  it('removes a friend and reloads', async () => {
    const onChanged = vi.fn()
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    const { user } = renderWithRouter(
      <WhosComing
        booking={booking}
        bookerName="Kai"
        companions={[{ user_id: 'u2', display_name: 'Mei Ling' }]}
        canRemove
        onChanged={onChanged}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(supabase.rpc).toHaveBeenCalledWith('remove_booking_companion', {
      p_booking_id: 'booking-1',
      p_user_id: 'u2',
    })
  })

  it('shows an error when remove fails', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'started' } })
    const { user } = renderWithRouter(
      <WhosComing booking={booking} bookerName="Kai" companions={[{ user_id: 'u2', display_name: 'Mei' }]} canRemove />,
    )
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText("Couldn't remove them. Try again.")).toBeInTheDocument()
  })

  it('hides Remove after the session starts and the send button when full', () => {
    renderWithRouter(
      <WhosComing
        booking={{ ...booking, guests_count: 2 }}
        bookerName="Kai"
        companions={[{ user_id: 'u2', display_name: 'Mei' }]}
        canRemove={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send your friends their seat' })).not.toBeInTheDocument()
    expect(screen.getByText('2 of 2 seats')).toBeInTheDocument()
  })
})
