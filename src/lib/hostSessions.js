import { formatSessionDay, formatSessionTime } from './sessionDate'
import { singaporeDateKey } from './sessionCalendar'
import { bookingCutoffHours } from './bookingCutoff'

const TIME_ZONE = 'Asia/Singapore'
const FALLBACK_DURATION_MINS = 120

/** Paid bookings. Pending rows are unpaid checkouts, not guests. */
export function confirmedBookings(session) {
  return (session?.bookings ?? []).filter((booking) => booking.status === 'confirmed')
}

/** A pending checkout or a paid booking: the time can't move under either. */
export function hasBlockingBookings(session) {
  return (session?.bookings ?? []).some(
    (booking) => booking.status === 'pending' || booking.status === 'confirmed',
  )
}

export function bookedSeats(session) {
  return confirmedBookings(session).reduce(
    (sum, booking) => sum + Math.max(1, Number(booking.guests_count) || 1),
    0,
  )
}

/** Spots on the session, falling back to the listing's spots per session. */
export function sessionCapacity(session, listing) {
  const own = Number(session?.spots_total)
  if (Number.isInteger(own) && own > 0) return own
  const fromListing = Number(listing?.max_guests)
  return Number.isInteger(fromListing) && fromListing > 0 ? fromListing : 0
}

export function sessionDurationMins(session, listing) {
  for (const value of [session?.duration_mins, listing?.duration_mins]) {
    const mins = Number(value)
    if (Number.isInteger(mins) && mins >= 1) return mins
  }
  return FALLBACK_DURATION_MINS
}

/** "Sat 21 Nov". */
export function sessionDayLabel(iso, now = Date.now()) {
  return formatSessionDay(iso, now).replace(',', '')
}

/** "2:00 – 3:30 pm", or "11:00 am – 12:30 pm" across noon. */
export function sessionTimeRange(session, listing) {
  const start = new Date(session.starts_at)
  const end = new Date(start.getTime() + sessionDurationMins(session, listing) * 60_000)
  const from = formatSessionTime(start)
  const to = formatSessionTime(end)
  const [fromClock, fromHalf] = from.split(' ')
  const [, toHalf] = to.split(' ')
  return fromHalf && fromHalf === toHalf ? `${fromClock} – ${to}` : `${from} – ${to}`
}

/** The date tile on Next up: SAT / 21 / NOV. */
export function sessionDateTile(iso) {
  const date = new Date(iso)
  const part = (options) =>
    new Intl.DateTimeFormat('en-SG', { ...options, timeZone: TIME_ZONE }).format(date)
  return {
    weekday: part({ weekday: 'short' }).toUpperCase(),
    day: part({ day: 'numeric' }),
    month: part({ month: 'short' }).toUpperCase(),
  }
}

/** "today", "tomorrow", "in 6 days", counted in Singapore calendar days. */
export function relativeDayLabel(iso, now = Date.now()) {
  const days = Math.round(
    (Date.parse(`${singaporeDateKey(iso)}T00:00:00Z`) -
      Date.parse(`${singaporeDateKey(now)}T00:00:00Z`)) /
      86_400_000,
  )
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/** "1 with bookings · 2 open", plus taken dates when shared availability holds some. */
export function upcomingDatesSummary({ booked = 0, open = 0, held = 0 }) {
  const parts = []
  if (booked) parts.push(`${booked} with bookings`)
  if (open) parts.push(`${open} open`)
  if (held) parts.push(`${held} taken`)
  return parts.length ? parts.join(' · ') : 'No dates yet'
}

/** "WL" for "Wei Ling T.", "G" when there is no name. */
export function guestInitials(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
  if (words.length === 0) return 'G'
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

export function spotsLabel(count) {
  return `${count} ${count === 1 ? 'spot' : 'spots'}`
}

/** "Premium materials", or "Premium materials × 2". */
export function addonGuestLine(rows) {
  return (rows ?? [])
    .map((row) => {
      const quantity = Number(row.quantity) || 1
      return quantity > 1 ? `${row.name} × ${quantity}` : row.name
    })
    .join(', ')
}

/**
 * One card per paid booking on the session page: the booker, the friends who
 * took a seat, how many spots, the add-ons and the note.
 */
export function sessionGuestCards(session, { guestRows = [], addonsByBooking = {}, notesByBooking = {} } = {}) {
  return confirmedBookings(session).map((booking) => {
    const rows = guestRows.filter((row) => row.booking_id === booking.id)
    const booker = rows.find((row) => !row.is_companion)
    const friends = rows
      .filter((row) => row.is_companion)
      .map((row) => row.display_name?.trim())
      .filter(Boolean)
    return {
      id: booking.id,
      name: booker?.display_name?.trim() || 'Guest',
      spots: Math.max(1, Number(booking.guests_count) || 1),
      friends,
      addons: addonGuestLine(addonsByBooking[booking.id]),
      note: notesByBooking[booking.id]?.note ?? null,
    }
  })
}

/**
 * The line under the spots bar: what is still open, and when bookings close
 * for this listing.
 */
export function sessionSpotsLine(session, listing, now = Date.now()) {
  const capacity = sessionCapacity(session, listing)
  const open = Math.max(0, capacity - bookedSeats(session))
  const hours = bookingCutoffHours(listing?.booking_cutoff_hours)
  const closesAt = new Date(session.starts_at).getTime() - hours * 3_600_000
  if (open === 0) return 'Every spot is booked.'
  const still = `${spotsLabel(open)} still open.`
  if (now >= closesAt) return `${still} Bookings have closed for this session.`
  return `${still} Bookings close ${hours} ${hours === 1 ? 'hour' : 'hours'} before, as set on this listing.`
}
