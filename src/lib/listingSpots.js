import { formatSessionDateTime } from './sessionDate'

export const SESSION_HAS_BOOKINGS = 'session_has_bookings'
export const SESSION_HAS_BOOKINGS_MESSAGE =
  "Someone just started booking this session, so it can't be edited."

/** Remaining spots at or below this count as low, and use "N spot(s) left". */
export const LOW_SPOTS = 4

export function isLowSpots(n) {
  const left = Number(n)
  return Number.isFinite(left) && left >= 1 && left <= LOW_SPOTS
}

export function spotsLabel(n) {
  const left = Number(n)
  if (!Number.isFinite(left) || left <= 0) return 'Full'
  if (left === 1) return '1 spot left'
  if (left <= LOW_SPOTS) return `${left} spots left`
  return `${left} spots`
}

/** Floor used by `set_listing_spots`: capacity cannot drop below guests already on the row. */
export function floorSessionSpots(spots, confirmedBooked = 0, pendingBooked = 0) {
  const requested = Number(spots)
  const booked = Number(confirmedBooked) + Number(pendingBooked)
  const total = Math.max(requested, booked)
  return {
    spots_total: total,
    spots_remaining: total - Number(confirmedBooked),
    held: total > requested,
    booked,
  }
}

export function isSessionHasBookingsError(message) {
  return /session_has_bookings/i.test(String(message ?? ''))
}

export function firstSpotsResult(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

export function formatListingSpotsMessage(data, now = Date.now()) {
  const row = firstSpotsResult(data)
  const updated = Number(row?.updated) || 0
  const held = Array.isArray(row?.held) ? row.held : []
  const sessionWord = updated === 1 ? 'session' : 'sessions'
  const parts = [`Updated ${updated} future ${sessionWord}.`]
  for (const item of held) {
    const when = formatSessionDateTime(item.starts_at, now) || 'A session'
    const spots = Number(item.spots_total) || 0
    parts.push(
      `${when} kept ${spots} spot${spots === 1 ? '' : 's'} because of existing bookings.`,
    )
  }
  return parts.join(' ')
}
