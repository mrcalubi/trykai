import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BookingDetail from './BookingDetail'
import RequireAuth from '../components/RequireAuth'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { hoursFromNow, makeAuthSession } from '../test/fixtures'
import { formatSessionDay } from '../../supabase/functions/_shared/email.ts'

vi.mock('../lib/supabase')

const USER_ID = 'user-1'
const BOOKING_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

function formatSessionTime(iso) {
  return new Intl.DateTimeFormat('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso))
}

function detailBooking(overrides = {}) {
  return {
    id: BOOKING_ID,
    status: 'confirmed',
    guest_id: USER_ID,
    guests_count: 2,
    total_amount: 475,
    platform_fee: 285,
    payment_rail: 'paynow',
    sessions: {
      starts_at: hoursFromNow(72),
      duration_mins: 90,
      listings: {
        id: 'listing-1',
        title: 'Latte art',
        photo_urls: ['https://cdn.test/latte.jpg'],
        whats_provided: ['Apron', 'Coffee beans'],
        duration_mins: 90,
        host_id: 'host-1',
        users: {
          display_name: 'Mei Ling',
          full_name: 'Mei Ling Tan',
          avatar_url: 'https://cdn.test/mei.jpg',
        },
      },
    },
    ...overrides,
  }
}

function givenSignedIn(userId = USER_ID) {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: makeAuthSession({ user: { id: userId } }) },
    error: null,
  })
}

function givenBooking(booking) {
  supabase.__on('bookings', 'select', { data: booking, error: null })
}

function givenAddress(address) {
  supabase.rpc.mockImplementation(async (name) => {
    if (name === 'get_listing_address') return { data: address, error: null }
    return { data: null, error: null }
  })
}

function renderDetail(route = `/bookings/${BOOKING_ID}`) {
  return renderWithRouter(
    <RequireAuth>
      <Routes>
        <Route path="/bookings/:bookingId" element={<BookingDetail />} />
        <Route path="/bookings" element={<p>bookings home</p>} />
        <Route path="/listings/:id" element={<p>listing page</p>} />
        <Route path="/u/:id" element={<p>host profile</p>} />
      </Routes>
    </RequireAuth>,
    { route, path: '*', outlivesNavigation: true },
  )
}

beforeEach(() => {
  supabase.__reset()
  givenSignedIn()
  givenAddress('12 Club Street, Singapore 069410')
})

describe('BookingDetail', () => {
  it('shows the guest the listing, host, session, receipt and address', async () => {
    const booking = detailBooking()
    const startsAt = booking.sessions.starts_at
    givenBooking(booking)
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Latte art' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Latte art' })).toHaveAttribute(
      'href',
      '/listings/listing-1',
    )
    expect(screen.getByRole('link', { name: 'Latte art' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.test/latte.jpg',
    )
    expect(screen.getByRole('link', { name: 'Mei Ling' })).toHaveAttribute('href', '/u/host-1')
    expect(screen.getByText(formatSessionDay(startsAt))).toBeInTheDocument()
    expect(screen.getByText(formatSessionTime(startsAt))).toBeInTheDocument()
    expect(screen.getByText('1 hr 30 min')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add to Google Calendar' })).toHaveAttribute(
      'href',
      expect.stringContaining('calendar.google.com'),
    )
    expect(screen.getByText(/12 Club Street, Singapore 069410/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=12%20Club%20Street%2C%20Singapore%20069410',
    )
    expect(screen.getByText('Apron')).toBeInTheDocument()
    expect(screen.getByText('Coffee beans')).toBeInTheDocument()
    expect(screen.getByText('2 guests')).toBeInTheDocument()
    expect(screen.getByText('$4.75')).toBeInTheDocument()
    expect(screen.getByText('PayNow')).toBeInTheDocument()
    expect(screen.getByText('A1B2C3D4')).toBeInTheDocument()
    expect(screen.getByText('confirmed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
  })

  it('names Card when the guest did not pay with PayNow', async () => {
    givenBooking(detailBooking({ payment_rail: 'card', total_amount: 500 }))
    renderDetail()

    expect(await screen.findByText('Card')).toBeInTheDocument()
    expect(screen.getByText('$5')).toBeInTheDocument()
    expect(screen.queryByText('PayNow')).not.toBeInTheDocument()
  })

  it('omits What\'s provided, address and calendar when those are missing', async () => {
    givenAddress(null)
    givenBooking(
      detailBooking({
        sessions: {
          starts_at: '',
          duration_mins: 0,
          listings: {
            id: 'listing-1',
            title: 'Latte art',
            photo_urls: [],
            whats_provided: ['None'],
            host_id: 'host-1',
            users: { display_name: 'Mei Ling' },
          },
        },
      }),
    )
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Latte art' })).toBeInTheDocument()
    expect(screen.queryByText("What's provided")).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open in Google Maps' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add to Google Calendar' })).not.toBeInTheDocument()
  })

  it('sends anyone who is not the guest back to bookings', async () => {
    givenBooking(detailBooking({ guest_id: 'someone-else' }))
    const { currentPath } = renderDetail()

    await waitFor(() => expect(currentPath()).toBe('/bookings'))
    expect(screen.getByText('bookings home')).toBeInTheDocument()
  })

  it('sends a missing booking back to bookings', async () => {
    givenBooking(null)
    const { currentPath } = renderDetail()

    await waitFor(() => expect(currentPath()).toBe('/bookings'))
  })

  it('quotes the refund and calls cancel-booking', async () => {
    givenBooking(detailBooking())
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, refund_amount: 475 }, error: null })
    const { user } = renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }))
    expect(screen.getByText(/Full refund of \$4\.75/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled())
    expect(supabase.functions.invoke).toHaveBeenCalledWith('cancel-booking', {
      body: { booking_id: BOOKING_ID },
      headers: { Authorization: 'Bearer test-access-token' },
    })
  })

  it('does not offer cancel on a past or already cancelled booking', async () => {
    givenBooking(
      detailBooking({
        status: 'cancelled',
        sessions: { ...detailBooking().sessions, starts_at: hoursFromNow(-2) },
      }),
    )
    renderDetail()

    expect(await screen.findByText('cancelled')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })
})
