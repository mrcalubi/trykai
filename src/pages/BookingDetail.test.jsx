import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BookingDetail from './BookingDetail'
import RequireAuth from '../components/RequireAuth'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { hoursFromNow, makeAuthSession } from '../test/fixtures'
import { formatSessionDay } from '../lib/sessionDate'
import { SHARE_NOTES } from '../lib/share'

vi.mock('../lib/supabase')
vi.mock('../lib/compressImage', () => ({ compressImage: vi.fn(async (file) => file) }))

const USER_ID = 'user-1'
const BOOKING_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const SESSION_ID = 'session-1'

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
    created_at: hoursFromNow(-24),
    session_id: SESSION_ID,
    rescheduled_at: null,
    sessions: {
      id: SESSION_ID,
      starts_at: hoursFromNow(72),
      duration_mins: 90,
      listings: {
        id: 'listing-1',
        title: 'Latte art',
        photo_urls: ['https://cdn.test/latte.jpg'],
        whats_provided: ['Apron', 'Coffee beans'],
        what_to_bring: ['Water bottle'],
        duration_mins: 90,
        host_id: 'host-1',
        area: 'Tiong Bahru',
        price_per_person: 2500,
        group_pricing: true,
        users: {
          display_name: 'Mei Ling',
          avatar_url: 'https://cdn.test/mei.jpg',
          bio: 'I teach latte art in a small studio.',
          is_id_verified: true,
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
    if (name === 'listing_address') return { data: address, error: null }
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
  supabase.__on('reviews', 'select', (ctx) =>
    ctx.single ? { data: null, error: null } : { data: [], error: null },
  )
  supabase.__on('sessions', 'select', { data: [], error: null })
})

describe('BookingDetail', () => {
  it('shows the canvas booking page for an upcoming confirmed booking', async () => {
    const booking = detailBooking()
    const startsAt = booking.sessions.starts_at
    givenBooking(booking)
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Latte art' })).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText(/with Mei Ling · Tiong Bahru · 2 guests/)).toBeInTheDocument()
    expect(screen.getByText(formatSessionDay(startsAt))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(formatSessionTime(startsAt)))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Google' })).toHaveAttribute(
      'href',
      expect.stringContaining('calendar.google.com'),
    )
    expect(supabase.rpc).toHaveBeenCalledWith('listing_address', { listing_id: 'listing-1' })
    expect(screen.getByText(/12 Club Street, Singapore 069410/)).toBeInTheDocument()
    expect(screen.getByText('Only guests see the exact address.')).toBeInTheDocument()
    expect(screen.getByText('Apron')).toBeInTheDocument()
    expect(screen.getByText('Water bottle')).toBeInTheDocument()
    expect(screen.getByText('ID verified')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/u/host-1')
    expect(screen.getByText('Total paid')).toBeInTheDocument()
    expect(screen.getByText(/Paid with PayNow/)).toBeInTheDocument()
    expect(screen.getByText(/Ref A1B2C3D4/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plans changed? Manage booking' })).toBeInTheDocument()
    expect(screen.getByText(/Something not right/)).toBeInTheDocument()
    expect(screen.queryByText(/Full refund if you cancel/)).not.toBeInTheDocument()
    expect(supabase.__lastCall('bookings', 'select').chain[0].args[0]).not.toMatch(/full_name/)
  })

  it('lists the add-ons the guest bought and the extras note', async () => {
    givenBooking(detailBooking())
    supabase.__on('booking_addons', 'select', {
      data: [
        {
          booking_id: BOOKING_ID,
          name: 'Premium blooms',
          quantity: 1,
          unit: 'person',
          unit_guest_cents: 1700,
        },
      ],
      error: null,
    })
    renderDetail()
    expect(await screen.findByText(/Premium blooms × 1/)).toBeInTheDocument()
    expect(screen.getByText(/Mei Ling is preparing your extras/)).toBeInTheDocument()
  })

  it('opens the manage sheet, quotes the refund, and calls cancel-booking', async () => {
    givenBooking(detailBooking())
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, refund_amount: 190 }, error: null })
    const { user } = renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Plans changed? Manage booking' }))
    expect(screen.getByRole('heading', { name: "Can't make it?" })).toBeInTheDocument()
    expect(screen.getByText(/If you cancel now:/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    expect(screen.getByText(/The booking fee isn't refunded/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled())
    expect(supabase.functions.invoke).toHaveBeenCalledWith('cancel-booking', {
      body: { booking_id: BOOKING_ID },
      headers: { Authorization: 'Bearer test-access-token' },
    })
  })

  it('moves the booking to another date from the sheet', async () => {
    const next = {
      id: 'session-2',
      starts_at: hoursFromNow(120),
      duration_mins: 90,
      spots_remaining: 3,
      status: 'open',
    }
    givenBooking(detailBooking())
    supabase.__on('sessions', 'select', { data: [next], error: null })
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, session_id: next.id }, error: null })
    const { user } = renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Plans changed? Manage booking' }))
    await user.click(await screen.findByRole('button', { name: new RegExp(formatSessionDay(next.starts_at)) }))
    expect(screen.getByText(/You can only move a booking once/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move booking' }))
    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled())
    expect(supabase.functions.invoke).toHaveBeenCalledWith('reschedule-booking', {
      body: { booking_id: BOOKING_ID, session_id: 'session-2' },
      headers: { Authorization: 'Bearer test-access-token' },
    })
  })

  it('says why moving is closed after a first move', async () => {
    givenBooking(detailBooking({ rescheduled_at: hoursFromNow(-2) }))
    const { user } = renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Plans changed? Manage booking' }))
    expect(screen.getByText("You've already moved this booking once")).toBeInTheDocument()
  })

  it('downloads an Apple calendar file from the browser', async () => {
    givenBooking(detailBooking())
    const clicks = []
    const createObjectURL = vi.fn(() => 'blob:ics')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const node = realCreate(tag)
      if (tag === 'a') {
        node.click = () => clicks.push(node.download)
      }
      return node
    })
    const { user } = renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Apple' }))
    expect(clicks).toEqual(['trykai-booking.ics'])
    expect(createObjectURL).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('copies the listing link when the share sheet is missing', async () => {
    givenBooking(detailBooking())
    const { user } = renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Share listing' }))
    expect(await screen.findByText(SHARE_NOTES.copied)).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toMatch(/\/listings\/listing-1$/)
  })

  it('keeps the packing list when storage is blocked', async () => {
    givenBooking(detailBooking())
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
    })
    const { user } = renderDetail()
    const box = await screen.findByRole('checkbox', { name: 'Water bottle' })
    expect(box).not.toBeChecked()
    await user.click(box)
    expect(box).toBeChecked()
  })

  it('puts directions first on the day of the session', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-31T04:00:00.000Z'))
    givenBooking(
      detailBooking({
        sessions: {
          ...detailBooking().sessions,
          starts_at: '2026-10-31T08:00:00.000Z',
        },
      }),
    )
    renderDetail()
    expect(await screen.findByText(/Today · starts in/)).toBeInTheDocument()
    const where = screen.getByRole('heading', { name: 'Where' })
    const bring = screen.getByRole('heading', { name: 'Before you go' })
    expect(where.compareDocumentPosition(bring) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Plans changed? Manage booking' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('asks for a review after the session and keeps buttons short', async () => {
    givenBooking(
      detailBooking({
        sessions: {
          ...detailBooking().sessions,
          starts_at: hoursFromNow(-5),
        },
      }),
    )
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'How was it with Mei Ling?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave a review' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go again' })).toHaveAttribute('href', '/listings/listing-1')
    expect(screen.getByRole('link', { name: 'See dates' })).toHaveAttribute('href', '/listings/listing-1')
    expect(screen.queryByRole('button', { name: /Find another time with/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Plans changed? Manage booking' })).not.toBeInTheDocument()
  })

  it('shows the refund on a cancelled booking', async () => {
    givenBooking(
      detailBooking({
        status: 'cancelled',
        refund_amount: 190,
        stripe_refund_id: 're_1',
      }),
    )
    renderDetail()
    expect(await screen.findByText('$1.90 on its way back')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find another time' })).toHaveAttribute(
      'href',
      '/listings/listing-1',
    )
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('sends anyone who is not the guest back to bookings', async () => {
    givenBooking(detailBooking({ guest_id: 'someone-else' }))
    const { currentPath } = renderDetail()
    await waitFor(() => expect(currentPath()).toBe('/bookings'))
  })

  it('sends a missing booking back to bookings', async () => {
    givenBooking(null)
    const { currentPath } = renderDetail()
    await waitFor(() => expect(currentPath()).toBe('/bookings'))
  })
})

describe('Report a problem', () => {
  const ended = (hoursAgo) => ({
    ...detailBooking().sessions,
    starts_at: hoursFromNow(-hoursAgo - 1.5),
    duration_mins: 90,
  })
  const text = 'The host arrived forty minutes late and cut the session short.'

  it('lets the guest report within 3 days after the session ends', async () => {
    givenBooking(detailBooking({ sessions: ended(1) }))
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: true, created_at: hoursFromNow(0), photos_failed: 0 },
      error: null,
    })
    const { user } = renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Report it within 3 days' }))
    expect(screen.getByText(/Reports close .+, 3 days after the session ends\./)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'What happened?' }), text)
    const photo = new File(['x'], 'late.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/Photos \(optional\)/), photo)
    await user.click(screen.getByRole('button', { name: 'Send report' }))

    await waitFor(() => expect(screen.getByText(/You reported a problem on/)).toBeInTheDocument())
    const [name, options] = supabase.functions.invoke.mock.calls[0]
    expect(name).toBe('report-booking-problem')
    expect(options.headers).toEqual({ Authorization: 'Bearer test-access-token' })
    expect(options.body.get('booking_id')).toBe(BOOKING_ID)
    expect(options.body.get('description')).toBe(text)
    expect(options.body.getAll('photos')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Report it within 3 days' })).not.toBeInTheDocument()
  })

  it('checks the description before sending', async () => {
    givenBooking(detailBooking({ sessions: ended(1) }))
    const { user } = renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Report it within 3 days' }))
    await user.type(screen.getByRole('textbox', { name: 'What happened?' }), 'Too short')
    await user.click(screen.getByRole('button', { name: 'Send report' }))

    expect(screen.getByText('Please tell us what happened in at least 20 characters.')).toBeInTheDocument()
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('refuses more than 3 photos before compressing', async () => {
    givenBooking(detailBooking({ sessions: ended(1) }))
    const { user } = renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Report it within 3 days' }))
    await user.type(screen.getByRole('textbox', { name: 'What happened?' }), text)
    const photos = [1, 2, 3, 4].map((n) => new File(['x'], `${n}.jpg`, { type: 'image/jpeg' }))
    await user.upload(screen.getByLabelText(/Photos \(optional\)/), photos)
    await user.click(screen.getByRole('button', { name: 'Send report' }))

    expect(screen.getByText('Add up to 3 photos.')).toBeInTheDocument()
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('shows the server refusal and lets the guest back out', async () => {
    givenBooking(detailBooking({ sessions: ended(1) }))
    supabase.functions.invoke.mockResolvedValue({
      data: { error: "You've already reported this booking. Reply to our email to add anything." },
      error: null,
    })
    const { user } = renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Report it within 3 days' }))
    await user.type(screen.getByRole('textbox', { name: 'What happened?' }), text)
    await user.click(screen.getByRole('button', { name: 'Send report' }))

    expect(await screen.findByText(/already reported this booking/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Never mind' }))
    expect(screen.getByRole('button', { name: 'Report it within 3 days' })).toBeInTheDocument()
  })

  it('asks for missing photos when some did not upload', async () => {
    givenBooking(detailBooking({ sessions: ended(1) }))
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: true, photos_failed: 1 },
      error: null,
    })
    const { user } = renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Report it within 3 days' }))
    await user.type(screen.getByRole('textbox', { name: 'What happened?' }), text)
    await user.click(screen.getByRole('button', { name: 'Send report' }))

    expect(
      await screen.findByText("Some photos didn't upload. Reply to our email with them."),
    ).toBeInTheDocument()
  })

  it('shows an earlier report instead of the button', async () => {
    givenBooking(detailBooking({ sessions: ended(1) }))
    supabase.__on('booking_complaints', 'select', {
      data: { created_at: hoursFromNow(-0.5) },
      error: null,
    })
    renderDetail()

    expect(await screen.findByText(/You reported a problem on/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report it within 3 days' })).not.toBeInTheDocument()
    expect(supabase.__lastCall('booking_complaints', 'select').chain[0].args[0]).toBe('created_at')
  })

  it('closes 3 days after the session ends but keeps the safety email', async () => {
    givenBooking(detailBooking({ sessions: ended(73) }))
    renderDetail()

    expect(await screen.findByRole('link', { name: 'Email hello@trykai.sg' })).toHaveAttribute(
      'href',
      'mailto:hello@trykai.sg?subject=Safety%20report%3A%20booking%20A1B2C3D4',
    )
    expect(screen.queryByRole('button', { name: 'Report it within 3 days' })).not.toBeInTheDocument()
  })

  it('is not offered before the session starts', async () => {
    givenBooking(detailBooking())
    renderDetail()
    expect(await screen.findByRole('link', { name: 'Email hello@trykai.sg' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report a problem' })).not.toBeInTheDocument()
  })

  it('shows nothing on a cancelled booking', async () => {
    givenBooking(detailBooking({ status: 'cancelled', refund_amount: 190, sessions: ended(1) }))
    renderDetail()
    expect(await screen.findByText(/on its way back/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Email hello@trykai.sg' })).not.toBeInTheDocument()
    expect(supabase.__calls('booking_complaints', 'select')).toHaveLength(0)
  })
})
