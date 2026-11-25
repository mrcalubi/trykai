// Admin bookings view (/admin/bookings) and the admin "new booking" alert.
//
// Pure apart from notifyAdminsOfBooking, which takes the service-role client
// and fetch so vitest covers it without Supabase or Telegram. Nothing here may
// throw into the Stripe webhook: a failed alert must never undo a booking.

import { bookingReference, escapeHtml, formatSessionDate, publicDisplayName } from './email.ts'
import { envValue, sendTelegram, type TelegramMessage } from './telegram.ts'

/** Pending rows are checkouts that were never paid, so the view leaves them out. */
export const ADMIN_BOOKING_STATUSES = ['confirmed', 'cancelled'] as const

/** Enough for the team's view for a long while; older rows are in SQL. */
export const ADMIN_BOOKINGS_LIMIT = 300

/** PostgREST select for one booking with its guest, friends, session, listing and host. */
export const ADMIN_BOOKINGS_SELECT = [
  'id, created_at, status, guests_count, total_amount, platform_fee, refund_amount, payment_rail, cancelled_by, cancelled_at',
  'guest:users!guest_id (display_name, full_name, email)',
  'booking_guests (users (display_name, full_name))',
  'sessions (starts_at, duration_mins, listings (id, title, host:users!host_id (display_name, full_name)))',
].join(', ')

type NameLike = { display_name?: string | null; full_name?: string | null } | null | undefined

type RawBooking = {
  id?: string
  created_at?: string | null
  status?: string | null
  guests_count?: number | null
  total_amount?: number | null
  platform_fee?: number | null
  refund_amount?: number | null
  payment_rail?: string | null
  cancelled_by?: string | null
  cancelled_at?: string | null
  guest?: (NameLike & { email?: string | null }) | null
  booking_guests?: { users?: NameLike }[] | null
  sessions?: {
    starts_at?: string | null
    duration_mins?: number | null
    listings?: { id?: string; title?: string | null; host?: NameLike } | null
  } | null
}

export type AdminBooking = {
  id: string
  reference: string
  status: string
  booked_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  guests_count: number
  paid_cents: number
  fee_cents: number
  refund_cents: number
  payment_rail: string | null
  guest: { name: string; email: string | null }
  friends: string[]
  listing: { id: string | null; title: string }
  host: { name: string }
  session: { starts_at: string | null; duration_mins: number | null }
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export function shapeAdminBooking(row: RawBooking): AdminBooking {
  const session = one(row.sessions)
  const listing = one(session?.listings)
  const guest = one(row.guest)
  const friends = (row.booking_guests ?? [])
    .map((friend) => publicDisplayName(one(friend?.users)))
    .filter(Boolean)
  return {
    id: String(row.id ?? ''),
    reference: bookingReference(row.id),
    status: String(row.status ?? ''),
    booked_at: row.created_at ?? null,
    cancelled_at: row.cancelled_at ?? null,
    cancelled_by: row.cancelled_by ?? null,
    guests_count: Number(row.guests_count) || 1,
    paid_cents: Number(row.total_amount) || 0,
    fee_cents: Number(row.platform_fee) || 0,
    refund_cents: Number(row.refund_amount) || 0,
    payment_rail: row.payment_rail ?? null,
    guest: { name: publicDisplayName(guest) || 'Guest', email: guest?.email ?? null },
    friends,
    listing: { id: listing?.id ?? null, title: listing?.title || 'Deleted listing' },
    host: { name: publicDisplayName(one(listing?.host)) || 'Host' },
    session: { starts_at: session?.starts_at ?? null, duration_mins: session?.duration_mins ?? null },
  }
}

function time(iso: string | null): number {
  const value = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(value) ? 0 : value
}

/**
 * upcoming: confirmed bookings whose session has not started, soonest first.
 * recent: every confirmed or cancelled booking, newest booking first.
 */
export function splitAdminBookings(rows: RawBooking[], nowMs: number): {
  upcoming: AdminBooking[]
  recent: AdminBooking[]
} {
  const all = rows
    .map(shapeAdminBooking)
    .filter((b) => b.id && (ADMIN_BOOKING_STATUSES as readonly string[]).includes(b.status))
  const upcoming = all
    .filter((b) => b.status === 'confirmed' && b.session.starts_at && time(b.session.starts_at) >= nowMs)
    .sort((a, b) => time(a.session.starts_at) - time(b.session.starts_at))
  const recent = [...all].sort((a, b) => time(b.booked_at) - time(a.booked_at))
  return { upcoming, recent }
}

// ---------------------------------------------------------------------------
// New booking alert for the team
// ---------------------------------------------------------------------------

export type AdminBookingAlert = {
  bookingId: string
  guestName: string
  guestEmail?: string | null
  listingTitle: string
  hostName: string
  startsAt: string
  guestsCount: number
  paidCents: number
  place?: string
  siteUrl?: string
}

function dollars(cents: number): string {
  const value = (Number(cents) || 0) / 100
  return `$${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}`
}

function people(count: number): string {
  return count === 1 ? '1 person' : `${count} people`
}

function adminLink(siteUrl?: string): string {
  return `${(siteUrl || 'https://trykai.sg').replace(/\/+$/, '')}/admin/bookings`
}

function when(startsAt: string): string {
  return startsAt ? formatSessionDate(startsAt) : 'date unknown'
}

export function adminNewBookingTelegram(o: AdminBookingAlert): TelegramMessage {
  const title = o.place ? `${o.listingTitle} (${o.place})` : o.listingTitle
  return {
    text:
      `New booking: ${o.guestName} booked ${title} with ${o.hostName}, ` +
      `${when(o.startsAt)}, ${people(o.guestsCount)}, paid ${dollars(o.paidCents)}.`,
    url: adminLink(o.siteUrl),
    label: 'Open bookings',
  }
}

export function adminNewBookingEmail(o: AdminBookingAlert): { subject: string; html: string } {
  const rows: [string, string][] = [
    ['Guest', o.guestEmail ? `${o.guestName} (${o.guestEmail})` : o.guestName],
    ['Class', o.place ? `${o.listingTitle}, ${o.place}` : o.listingTitle],
    ['Host', o.hostName],
    ['When', when(o.startsAt)],
    ['Guests', people(o.guestsCount)],
    ['Paid', dollars(o.paidCents)],
    ['Reference', bookingReference(o.bookingId)],
  ]
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b6b6b">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join('')
  return {
    subject: `New booking: ${o.listingTitle}, ${when(o.startsAt)}`,
    html:
      `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16264B">` +
      `<p>New confirmed booking.</p><table>${table}</table>` +
      `<p><a href="${escapeHtml(adminLink(o.siteUrl))}">See all bookings</a></p></div>`,
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

// Same loose shape as telegram.ts, so the real Supabase client fits.
// deno-lint-ignore no-explicit-any
type AdminClientLike = { from: (table: string) => any }

/**
 * Telegram to every admin who connected Telegram in Settings, plus one email to
 * ADMIN_NOTIFY_EMAIL as the record. Never throws.
 */
export async function notifyAdminsOfBooking(
  admin: AdminClientLike,
  alert: AdminBookingAlert,
  deps: {
    sendEmail: (email: { to: string; subject: string; html: string }) => Promise<void>
    opsEmail: string
    token?: string
    fetchImpl?: FetchLike
  },
): Promise<{ telegram: number; email: boolean }> {
  let telegram = 0
  let email = false
  try {
    const token = deps.token ?? envValue('TELEGRAM_BOT_TOKEN')
    if (token) {
      const { data } = await admin
        .from('users')
        .select('telegram_chat_id')
        .eq('is_admin', true)
        .not('telegram_chat_id', 'is', null)
      const message = adminNewBookingTelegram(alert)
      for (const row of (data as { telegram_chat_id?: number | string | null }[] | null) ?? []) {
        const result = await sendTelegram({ token, chatId: row.telegram_chat_id, message, fetchImpl: deps.fetchImpl })
        if (result === 'sent') telegram += 1
      }
    }
  } catch (err) {
    console.error('admin booking telegram failed', err instanceof Error ? err.message : err)
  }
  try {
    if (deps.opsEmail) {
      await deps.sendEmail({ to: deps.opsEmail, ...adminNewBookingEmail(alert) })
      email = true
    }
  } catch (err) {
    console.error('admin booking email failed', err instanceof Error ? err.message : err)
  }
  return { telegram, email }
}
