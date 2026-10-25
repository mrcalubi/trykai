// Session reminder window: a confirmed booking on an open session that
// starts in 2–24 hours, claimed more than 6 hours ago. Hosts get one
// email per session that still has at least one confirmed guest.

export const REMINDER_WINDOW_MIN_MS = 2 * 60 * 60 * 1000
export const REMINDER_WINDOW_MAX_MS = 24 * 60 * 60 * 1000
export const FRESH_BOOKING_MS = 6 * 60 * 60 * 1000
export const REMINDER_EMAIL_CAP = 200

export type GuestReminderSkipReason =
  | 'not_confirmed'
  | 'session_not_open'
  | 'already_sent'
  | 'fresh_booking'
  | 'outside_window'
  | 'invalid_starts_at'
  | 'invalid_confirmed_at'

export type HostReminderSkipReason =
  | 'session_not_open'
  | 'already_sent'
  | 'no_confirmed_bookings'
  | 'outside_window'
  | 'invalid_starts_at'

export interface GuestReminderCandidate {
  status: string
  sessionStatus: string
  startsAt: string
  guestReminderSentAt: string | null
  /** bookings.created_at: there is no confirmed_at column. */
  confirmedAt: string
}

export interface HostReminderCandidate {
  status: string
  startsAt: string
  hostReminderSentAt: string | null
  confirmedBookingCount: number
}

export interface ReminderGuest {
  name: string
  guestsCount: number
}

export function reminderWindowIso(nowMs = Date.now()): {
  windowStart: string
  windowEnd: string
  confirmedBefore: string
} {
  return {
    windowStart: new Date(nowMs + REMINDER_WINDOW_MIN_MS).toISOString(),
    windowEnd: new Date(nowMs + REMINDER_WINDOW_MAX_MS).toISOString(),
    confirmedBefore: new Date(nowMs - FRESH_BOOKING_MS).toISOString(),
  }
}

export function sessionInReminderWindow(startsAt: string, nowMs = Date.now()): boolean {
  const start = new Date(startsAt).getTime()
  if (Number.isNaN(start)) return false
  return start >= nowMs + REMINDER_WINDOW_MIN_MS && start <= nowMs + REMINDER_WINDOW_MAX_MS
}

export function guestReminderSkipReason(
  booking: GuestReminderCandidate,
  nowMs = Date.now(),
): GuestReminderSkipReason | null {
  if (booking.status !== 'confirmed') return 'not_confirmed'
  if (booking.sessionStatus !== 'open') return 'session_not_open'
  if (booking.guestReminderSentAt) return 'already_sent'
  const confirmed = new Date(booking.confirmedAt).getTime()
  if (Number.isNaN(confirmed)) return 'invalid_confirmed_at'
  if (nowMs - confirmed < FRESH_BOOKING_MS) return 'fresh_booking'
  const start = new Date(booking.startsAt).getTime()
  if (Number.isNaN(start)) return 'invalid_starts_at'
  if (!sessionInReminderWindow(booking.startsAt, nowMs)) return 'outside_window'
  return null
}

export function hostReminderSkipReason(
  session: HostReminderCandidate,
  nowMs = Date.now(),
): HostReminderSkipReason | null {
  if (session.status !== 'open') return 'session_not_open'
  if (session.hostReminderSentAt) return 'already_sent'
  if (!session.confirmedBookingCount || session.confirmedBookingCount < 1) {
    return 'no_confirmed_bookings'
  }
  const start = new Date(session.startsAt).getTime()
  if (Number.isNaN(start)) return 'invalid_starts_at'
  if (!sessionInReminderWindow(session.startsAt, nowMs)) return 'outside_window'
  return null
}

export function personWord(count: number): 'person' | 'people' {
  return Number(count) === 1 ? 'person' : 'people'
}

/** One host email lists every confirmed booking on that session. */
export function groupBookingsBySession(
  bookings: Array<{ sessionId: string; guestName: string; guestsCount: number }>,
): Map<string, { guests: ReminderGuest[]; totalGuests: number }> {
  const groups = new Map<string, { guests: ReminderGuest[]; totalGuests: number }>()
  for (const row of bookings) {
    const group = groups.get(row.sessionId) ?? { guests: [], totalGuests: 0 }
    const raw = Number(row.guestsCount)
    const guestsCount = Number.isFinite(raw) && raw > 0 ? raw : 1
    group.guests.push({ name: row.guestName, guestsCount })
    group.totalGuests += guestsCount
    groups.set(row.sessionId, group)
  }
  return groups
}
