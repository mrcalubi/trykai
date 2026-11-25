import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import AdminBookings from './AdminBookings'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeAuthSession } from '../test/fixtures'

vi.mock('../lib/supabase')

function makeBooking(overrides = {}) {
  return {
    id: 'booking-1',
    reference: 'BOOKING1',
    status: 'confirmed',
    booked_at: '2026-11-24T02:00:00.000Z',
    cancelled_at: null,
    cancelled_by: null,
    guests_count: 2,
    paid_cents: 6800,
    fee_cents: 800,
    refund_cents: 0,
    payment_rail: 'card',
    guest: { name: 'Mei', email: 'mei@example.com' },
    friends: ['Jun'],
    listing: { id: 'listing-1', title: 'Bead charms' },
    host: { name: 'Malene' },
    session: { starts_at: '2026-11-29T06:00:00.000Z', duration_mins: 120 },
    ...overrides,
  }
}

function givenBookings(result) {
  supabase.functions.invoke.mockImplementation(async (name, options) => {
    if (name === 'admin-bookings' && options?.body?.action === 'list') return { data: result, error: null }
    return { data: null, error: null }
  })
}

function renderPage() {
  return renderWithRouter(<AdminBookings />, { route: '/admin/bookings', path: '/admin/bookings' })
}

beforeEach(() => {
  supabase.__reset()
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: 'admin-1' } }) },
    error: null,
  })
})

describe('AdminBookings', () => {
  it('shows who booked which class, when, with whom', async () => {
    const booking = makeBooking()
    givenBookings({ upcoming: [booking], recent: [booking] })
    renderPage()

    expect(await screen.findByText('Bead charms')).toBeInTheDocument()
    const card = screen.getByText('Bead charms').closest('article')
    expect(within(card).getByText('Mei')).toBeInTheDocument()
    expect(within(card).getByText(/mei@example\.com · 2 guests \(with Jun\)/)).toBeInTheDocument()
    expect(within(card).getByText(/Sun, 29 Nov.*2 hr · with Malene/)).toBeInTheDocument()
    expect(within(card).getByText(/Confirmed · Paid S\$68/)).toBeInTheDocument()
    expect(screen.getByText(/1 upcoming booking, 2 guests/)).toBeInTheDocument()
  })

  it('switches to latest bookings, including cancellations', async () => {
    const cancelled = makeBooking({
      id: 'booking-2',
      status: 'cancelled',
      cancelled_by: 'guest',
      refund_cents: 6000,
      listing: { id: 'listing-2', title: 'Latte art' },
    })
    givenBookings({ upcoming: [], recent: [cancelled] })
    renderPage()

    expect(await screen.findByText('No upcoming bookings yet.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Latest bookings' }))
    const card = screen.getByText('Latte art').closest('article')
    expect(within(card).getByText(/Cancelled by guest, refunded S\$60/)).toBeInTheDocument()
  })

  it('shows the error when the function refuses', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { error: 'Not authorised' }, error: null })
    renderPage()
    expect(await screen.findByText('Not authorised')).toBeInTheDocument()
  })
})
