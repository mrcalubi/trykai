import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HostSessionPage from './HostSessionPage'
import { renderWithRouter } from '../test/render'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase')

const LISTING = { id: 'l1', title: 'Pottery', max_guests: 4, duration_mins: 90 }

function session(overrides = {}) {
  return {
    id: 's1',
    listing_id: 'l1',
    location_id: 'loc-j',
    starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    duration_mins: 90,
    spots_total: 4,
    status: 'open',
    bookings: [{ id: 'b1', status: 'confirmed', guests_count: 1 }],
    ...overrides,
  }
}

function renderPage(props = {}) {
  return renderWithRouter(
    <HostSessionPage
      session={session()}
      listing={LISTING}
      guestRows={[{ booking_id: 'b1', display_name: 'Sam', is_companion: false }]}
      notesByBooking={{ b1: { note: 'Is there parking?' } }}
      backHref="/hosting"
      {...props}
    />,
    { route: '/hosting', path: '/hosting' },
  )
}

beforeEach(() => {
  supabase.__reset()
  supabase.rpc.mockReset()
})

describe('HostSessionPage with listing locations (00059)', () => {
  it("names the session's place and checks that place's directions", async () => {
    supabase.rpc.mockImplementation(async (name) =>
      name === 'listing_location_details'
        ? {
            data: [
              { id: 'loc-t', arrival_instructions: 'Lift B' },
              { id: 'loc-j', arrival_instructions: '' },
            ],
            error: null,
          }
        : { data: null, error: null },
    )
    renderPage({ locationName: 'Jurong studio · Jurong East' })

    expect(screen.getByText('Pottery · Jurong studio · Jurong East')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Add parking and directions to your listing' })).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('listing_location_details', { p_listing_id: 'l1' })
    expect(supabase.rpc).not.toHaveBeenCalledWith('listing_arrival_instructions', expect.anything())
  })

  it("falls back to the listing's directions when the place can't be read", async () => {
    supabase.rpc.mockImplementation(async (name) =>
      name === 'listing_location_details'
        ? { data: null, error: { message: 'Could not find the function' } }
        : { data: 'Gate C', error: null },
    )
    renderPage()

    expect(await screen.findByRole('link', { name: 'Update directions in your listing' })).toBeInTheDocument()
    expect(screen.getByText('Pottery')).toBeInTheDocument()
  })

  it('reads only the listing directions for a session with no location', async () => {
    supabase.rpc.mockResolvedValue({ data: '', error: null })
    renderPage({ session: session({ location_id: null }) })

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('listing_arrival_instructions', { listing_id: 'l1' }),
    )
    expect(supabase.rpc).not.toHaveBeenCalledWith('listing_location_details', expect.anything())
    expect(await screen.findByRole('link', { name: 'Add parking and directions to your listing' })).toBeInTheDocument()
  })
})
