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

/** "This month" on Hosting: sessions scheduled, guests booked and what the host earns from them. */
export function monthStats(sessions) {
  let guests = 0
  let earnedCents = 0
  for (const session of sessions) {
    for (const booking of session.bookings ?? []) {
      if (booking.status !== 'confirmed') continue
      guests += Number(booking.guests_count) || 0
      earnedCents += hostTakeCents(booking)
    }
  }
  return { sessions: sessions.length, guests, earnedCents }
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
