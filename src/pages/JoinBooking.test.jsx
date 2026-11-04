import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import JoinBooking from './JoinBooking'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { hoursFromNow, makeAuthSession } from '../test/fixtures'
import { JOIN_PAID_LINE, JOIN_SIGN_IN_HINT } from '../lib/companions'

vi.mock('../lib/supabase')

const CODE = 'abcdef0123456789abcd'

function preview(overrides = {}) {
  return {
    state: 'ok',
    booker_display_name: 'Kai',
    listing_id: 'listing-1',
    listing_title: 'Beginner flower arranging',
    listing_photo: null,
    area: 'Bishan',
    host_display_name: 'Nicholas',
    starts_at: hoursFromNow(72),
    duration_mins: 90,
    ...overrides,
  }
}

function givenPreview(row, { claim } = {}) {
  supabase.rpc.mockImplementation(async (name) => {
    if (name === 'join_preview') return { data: row ? [row] : [], error: null }
    if (name === 'claim_booking_seat') return claim ?? { data: 'booking-1', error: null }
    return { data: null, error: null }
  })
}

function givenSignedIn() {
  supabase.auth.getSession.mockResolvedValue({ data: { session: makeAuthSession() }, error: null })
}

function renderJoin() {
  return renderWithRouter(
    <Routes>
      <Route path="/join/:code" element={<JoinBooking />} />
      <Route path="/login" element={<p>login page</p>} />
      <Route path="/bookings/:id" element={<p>booking page</p>} />
    </Routes>,
    { route: `/join/${CODE}`, outlivesNavigation: true },
  )
}

describe('JoinBooking', () => {
  beforeEach(() => {
    supabase.__reset()
  })

  it('shows the seat without an address or prices to a signed-out friend', async () => {
    givenPreview(preview())
    renderJoin()

    expect(await screen.findByText('Kai saved you a seat')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Beginner flower arranging' })).toBeInTheDocument()
    expect(screen.getByText('with Nicholas · Bishan')).toBeInTheDocument()
    expect(screen.getByText(JOIN_PAID_LINE)).toBeInTheDocument()
    expect(screen.getByText(JOIN_SIGN_IN_HINT)).toBeInTheDocument()
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('join_preview', { p_code: CODE })
  })

  it('sends a signed-out friend to log in, then back here', async () => {
    givenPreview(preview())
    const { user, currentPath } = renderJoin()

    await user.click(await screen.findByRole('button', { name: 'Take my seat' }))

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(supabase.rpc).not.toHaveBeenCalledWith('claim_booking_seat', expect.anything())
  })

  it('claims the seat and opens the booking when signed in', async () => {
    givenSignedIn()
    givenPreview(preview())
    const { user, currentPath } = renderJoin()

    await user.click(await screen.findByRole('button', { name: 'Take my seat' }))

    await waitFor(() => expect(currentPath()).toBe('/bookings/booking-1'))
    expect(supabase.rpc).toHaveBeenCalledWith('claim_booking_seat', { p_code: CODE })
  })

  it('explains a claim that fails because the seats filled up meanwhile', async () => {
    givenSignedIn()
    givenPreview(preview(), { claim: { data: null, error: { message: 'full' } } })
    const { user } = renderJoin()

    await user.click(await screen.findByRole('button', { name: 'Take my seat' }))

    expect(
      await screen.findByText('All seats are taken. Ask Kai if you think this is a mistake.'),
    ).toBeInTheDocument()
  })

  it.each([
    ['full', 'All seats are taken. Ask Kai if you think this is a mistake.'],
    ['cancelled', 'This booking was cancelled.'],
    ['closed', 'This session has finished.'],
    ['already', "You're already booked for this session."],
  ])('shows the %s state instead of the button', async (state, line) => {
    givenPreview(preview({ state }))
    renderJoin()

    expect(await screen.findByText(line)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Take my seat' })).not.toBeInTheDocument()
  })

  it('says the link expired for an unknown code', async () => {
    givenPreview({ state: 'not_found' })
    renderJoin()

    expect(await screen.findByRole('heading', { name: 'This link has expired. Ask for a new one.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse sessions' })).toHaveAttribute('href', '/')
  })

  it('treats an RPC error as an expired link page', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    renderJoin()
    expect(await screen.findByRole('link', { name: 'Browse sessions' })).toBeInTheDocument()
  })
})
