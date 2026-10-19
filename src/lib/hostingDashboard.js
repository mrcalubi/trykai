import { formatCents } from './cancellationPolicy'
import { singaporeMonthKey } from './sessionCalendar'

/** Midnight on the 1st of this Singapore month, as an ISO string for a `starts_at` filter. */
export function monthStartIso(now = Date.now()) {
  return new Date(`${singaporeMonthKey(now)}-01T00:00:00+08:00`).toISOString()
}

export function isThisMonth(iso, now = Date.now()) {
  return Boolean(iso) && singaporeMonthKey(iso) === singaporeMonthKey(now)
}

/** What the host takes home from one paid booking. */
function hostTakeCents(booking) {
  if (Number.isFinite(booking.host_payout_amount)) return booking.host_payout_amount
  const total = Number(booking.total_amount) || 0
  const fee = Number(booking.platform_fee) || 0
  return Math.max(total - fee, 0)
}

function hasGuests(session) {
  return (session.bookings ?? []).some((booking) => booking.status === 'confirmed')
}

/**
 * The sessions "This month" counts: every date still to come this month, plus
 * the dates already past that had guests. A past date nobody booked never ran
 * and is not on the page, so counting it made the total look wrong.
 */
export function monthSessionsToCount(sessions, now = Date.now()) {
  return sessions
    .filter((session) => isThisMonth(session.starts_at, now))
    .map((session) => ({ ...session, held: new Date(session.starts_at).getTime() <= now }))
    .filter((session) => !session.held || hasGuests(session))
}

/** "This month" on Hosting: sessions held and to come, guests booked and what the host earns from them. */
export function monthStats(sessions) {
  let guests = 0
  let earnedCents = 0
  let held = 0
  for (const session of sessions) {
    if (session.held) held += 1
    for (const booking of session.bookings ?? []) {
      if (booking.status !== 'confirmed') continue
      guests += Number(booking.guests_count) || 0
      earnedCents += hostTakeCents(booking)
    }
  }
  return { sessions: sessions.length, held, toCome: sessions.length - held, guests, earnedCents }
}

/** "2 held · 5 to come": ties the Sessions total to the dates the page lists. */
export function monthSessionsNote({ held, toCome }) {
  if (held && toCome) return `${held} held · ${toCome} to come`
  if (held) return `${held} held`
  if (toCome) return `${toCome} to come`
  return ''
}

/**
 * A listing card's footer. Open dates are the rows under the card and booked
 * ones are under Upcoming bookings, so the line counts both instead of naming
 * a date that may sit in either place.
 */
export function listingDatesLine(openCount, bookedCount) {
  const open = openCount === 1 ? '1 open date' : `${openCount} open dates`
  if (openCount && bookedCount) return `${open} · ${bookedCount} booked`
  if (openCount) return open
  if (bookedCount) return `${bookedCount} booked · no open dates`
  return 'No dates yet'
}

export function formatSgd(cents) {
  return `S${formatCents(cents)}`
}

/** "90 min", "2 hr": short enough for one line of a listing row. */
export function compactDuration(mins) {
  const total = Number(mins)
  if (!Number.isInteger(total) || total < 1) return ''
  return total % 60 === 0 ? `${total / 60} hr` : `${total} min`
}

/** "S$23 · 90 min · up to 4", leaving out whatever is not set yet. */
export function listingFacts({ priceCents, durationMins, maxGuests }) {
  const parts = []
  if (Number.isFinite(priceCents) && priceCents > 0) parts.push(formatSgd(priceCents))
  const duration = compactDuration(durationMins)
  if (duration) parts.push(duration)
  if (Number.isInteger(maxGuests) && maxGuests > 0) parts.push(`up to ${maxGuests}`)
  return parts.join(' · ')
}
