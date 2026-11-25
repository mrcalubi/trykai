import { describe, expect, it, vi } from 'vitest'
import {
  adminNewBookingEmail,
  adminNewBookingTelegram,
  notifyAdminsOfBooking,
  shapeAdminBooking,
  splitAdminBookings,
} from './adminBookings.ts'

const NOW = Date.parse('2026-11-25T10:00:00Z')

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abcdef12-0000-4000-8000-000000000001',
    created_at: '2026-11-24T02:00:00Z',
    status: 'confirmed',
    guests_count: 2,
    total_amount: 6800,
    platform_fee: 800,
    refund_amount: 0,
    payment_rail: 'card',
    cancelled_by: null,
    cancelled_at: null,
    guest: { display_name: 'Mei', full_name: 'Tan Mei Ling', email: 'mei@example.com' },
    booking_guests: [{ users: { display_name: 'Jun', full_name: null } }],
    sessions: {
      starts_at: '2026-11-29T06:00:00Z',
      duration_mins: 120,
      listings: { id: 'listing-1', title: 'Bead charms', host: { display_name: 'Malene', full_name: null } },
    },
    ...overrides,
  }
}

describe('shapeAdminBooking', () => {
  it('flattens guest, friends, listing, host and session', () => {
    const b = shapeAdminBooking(row())
    expect(b.reference).toBe('ABCDEF12')
    expect(b.guest).toEqual({ name: 'Mei', email: 'mei@example.com' })
    expect(b.friends).toEqual(['Jun'])
    expect(b.listing).toEqual({ id: 'listing-1', title: 'Bead charms' })
    expect(b.host.name).toBe('Malene')
    expect(b.session.starts_at).toBe('2026-11-29T06:00:00Z')
    expect(b.paid_cents).toBe(6800)
    expect(b.fee_cents).toBe(800)
  })

  it('survives a deleted listing and missing guest', () => {
    const b = shapeAdminBooking(row({ guest: null, booking_guests: null, sessions: null }))
    expect(b.guest.name).toBe('Guest')
    expect(b.friends).toEqual([])
    expect(b.listing.title).toBe('Deleted listing')
    expect(b.session.starts_at).toBeNull()
  })
})

describe('splitAdminBookings', () => {
  it('keeps upcoming confirmed sessions soonest first and every booking newest first', () => {
    const later = row({ id: 'b2', created_at: '2026-11-20T00:00:00Z', sessions: { starts_at: '2026-12-05T06:00:00Z', listings: { title: 'Later' } } })
    const soon = row({ id: 'b1', created_at: '2026-11-22T00:00:00Z', sessions: { starts_at: '2026-11-26T06:00:00Z', listings: { title: 'Soon' } } })
    const past = row({ id: 'b3', created_at: '2026-11-25T00:00:00Z', sessions: { starts_at: '2026-11-20T06:00:00Z', listings: { title: 'Past' } } })
    const cancelled = row({ id: 'b4', status: 'cancelled', created_at: '2026-11-23T00:00:00Z' })
    const pending = row({ id: 'b5', status: 'pending' })

    const { upcoming, recent } = splitAdminBookings([later, soon, past, cancelled, pending], NOW)
    expect(upcoming.map((b) => b.id)).toEqual(['b1', 'b2'])
    expect(recent.map((b) => b.id)).toEqual(['b3', 'b4', 'b1', 'b2'])
  })
})

const alert = {
  bookingId: 'abcdef12-0000-4000-8000-000000000001',
  guestName: 'Mei <b>',
  guestEmail: 'mei@example.com',
  listingTitle: 'Bead charms',
  hostName: 'Malene',
  startsAt: '2026-11-29T06:00:00Z',
  guestsCount: 2,
  paidCents: 6800,
  siteUrl: 'https://trykai.sg/',
}

describe('admin alert messages', () => {
  it('Telegram names guest, class, host, people and amount, and links to the admin page', () => {
    const message = adminNewBookingTelegram(alert)
    expect(message.text).toContain('Mei <b> booked Bead charms with Malene')
    expect(message.text).toContain('2 people, paid $68.')
    expect(message.url).toBe('https://trykai.sg/admin/bookings')
  })

  it('email escapes names and carries the reference', () => {
    const email = adminNewBookingEmail(alert)
    expect(email.subject).toContain('New booking: Bead charms')
    expect(email.html).toContain('Mei &lt;b&gt; (mei@example.com)')
    expect(email.html).toContain('ABCDEF12')
    expect(email.html).not.toContain('<b>')
  })
})

describe('notifyAdminsOfBooking', () => {
  function adminWith(chatIds: (number | null)[]) {
    const not = vi.fn(async () => ({ data: chatIds.map((id) => ({ telegram_chat_id: id })), error: null }))
    const eq = vi.fn(() => ({ not }))
    const select = vi.fn(() => ({ eq }))
    return { client: { from: vi.fn(() => ({ select })) }, eq, not }
  }

  it('messages every linked admin on Telegram and emails the ops inbox', async () => {
    const { client, eq, not } = adminWith([111, 222])
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const sendEmail = vi.fn(async () => {})

    const result = await notifyAdminsOfBooking(client, alert, {
      token: 'bot-token',
      fetchImpl,
      sendEmail,
      opsEmail: 'ops@example.com',
    })

    expect(eq).toHaveBeenCalledWith('is_admin', true)
    expect(not).toHaveBeenCalledWith('telegram_chat_id', 'is', null)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ops@example.com' }))
    expect(result).toEqual({ telegram: 2, email: true })
  })

  it('never throws when Telegram and email both fail', async () => {
    const client = { from: vi.fn(() => { throw new Error('db down') }) }
    const sendEmail = vi.fn(async () => { throw new Error('resend down') })

    await expect(
      notifyAdminsOfBooking(client, alert, { token: 'bot-token', sendEmail, opsEmail: 'ops@example.com' }),
    ).resolves.toEqual({ telegram: 0, email: false })
  })

  it('skips Telegram without a bot token but still emails', async () => {
    const { client } = adminWith([111])
    const sendEmail = vi.fn(async () => {})
    const result = await notifyAdminsOfBooking(client, alert, { token: '', sendEmail, opsEmail: 'ops@example.com' })
    expect(client.from).not.toHaveBeenCalled()
    expect(result).toEqual({ telegram: 0, email: true })
  })
})
