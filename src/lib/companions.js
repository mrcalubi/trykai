// Who's coming: friends on a group booking (00050; canvas page "Who's coming").

export const COMPANION_SEND_HINT =
  "They'll see the time, the place and how to find it. Only you can move or cancel."
export const JOIN_PAID_LINE = 'Already paid. Nothing to pay.'
export const JOIN_SIGN_IN_HINT =
  'Sign in or create a free account so it shows on your profile and you get the directions.'

/** Seats a booker can hand out: everyone on the booking except the booker. */
export function companionSeats(guestsCount) {
  return Math.max(0, (Number(guestsCount) || 1) - 1)
}

export function joinUrl(code, origin = globalThis.location?.origin ?? 'https://trykai.sg') {
  return `${origin}/join/${encodeURIComponent(code)}`
}

/** "2 of 3 seats": the booker plus friends who took a seat, out of guests_count. */
export function seatsLabel(guestsCount, companionCount) {
  const total = Math.max(1, Number(guestsCount) || 1)
  const taken = Math.min(total, 1 + (Number(companionCount) || 0))
  return `${taken} of ${total} seats`
}

/** Join page and claim errors. RPCs raise a bare code; map it to one line. */
export function joinStateMessage(state, bookerName) {
  const who = bookerName || 'the person who booked'
  switch (state) {
    case 'full':
      return `All seats are taken. Ask ${who} if you think this is a mistake.`
    case 'cancelled':
      return 'This booking was cancelled.'
    case 'closed':
      return 'This session has finished.'
    case 'already':
      return "You're already booked for this session."
    case 'mine':
      return "This is your booking. Send the link to your friends."
    case 'not_found':
      return 'This link has expired. Ask for a new one.'
    default:
      return "That didn't work. Try again."
  }
}

export function claimErrorState(error) {
  const text = String(error?.message || '')
  for (const state of ['full', 'cancelled', 'closed', 'already', 'mine', 'not_found']) {
    if (text.includes(state)) return state
  }
  return 'error'
}

/**
 * Host's line for a session: "Kai, Mei Ling + 1 more". Bookers and claimed
 * friends by name; seats nobody has claimed yet are "+ N more".
 */
export function sessionGuestsLine(rows) {
  const list = rows ?? []
  if (list.length === 0) return ''
  const names = list.map((row) => row.display_name?.trim() || 'Guest')
  const seats = list
    .filter((row) => !row.is_companion)
    .reduce((sum, row) => sum + Math.max(1, Number(row.guests_count) || 1), 0)
  const unclaimed = Math.max(0, seats - list.length)
  return unclaimed > 0 ? `${names.join(', ')} + ${unclaimed} more` : names.join(', ')
}

export function groupGuestsBySession(rows) {
  const bySession = {}
  for (const row of rows ?? []) {
    const list = bySession[row.session_id] ?? []
    list.push(row)
    bySession[row.session_id] = list
  }
  return bySession
}

/** my_companion_bookings returns a jsonb array; tolerate a row-wrapped shape too. */
export function companionBookingsFromRpc(data) {
  if (Array.isArray(data)) {
    if (data.length === 1 && Array.isArray(data[0]?.my_companion_bookings)) {
      return data[0].my_companion_bookings
    }
    return data.filter((row) => row && typeof row === 'object' && row.id)
  }
  return []
}
