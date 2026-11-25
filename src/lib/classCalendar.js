import { isBookingClosed } from './bookingCutoff'
import { singaporeDateKey, singaporeMonthKey } from './sessionCalendar'

/**
 * Classes on the booking calendar. A listing with classes loads every upcoming
 * date at once, so picking a class can jump the calendar to that class's next
 * date.
 */

export function sessionsOfClass(sessions, classId) {
  const all = [...(sessions ?? [])].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  return classId ? all.filter((session) => session.type_id === classId) : all
}

/** A date a guest can still book: not past the listing's cutoff, not full. */
export function isBookable(session, cutoffHours, now = Date.now()) {
  return (
    Number(session.spots_remaining) > 0 &&
    !isBookingClosed(session.starts_at, cutoffHours, now) &&
    new Date(session.starts_at).getTime() > now
  )
}

/**
 * Where the calendar should be for a filter: keep a picked date that still
 * fits, otherwise jump to the first date the guest can book (or the first
 * date). { session, dateKey, monthKey }, or nulls when there are no dates.
 */
export function landingFor(sessions, classId, { keepId = null, cutoffHours, now = Date.now() } = {}) {
  const shown = sessionsOfClass(sessions, classId)
  const kept = keepId ? shown.find((session) => session.id === keepId) : null
  const session = kept ?? shown.find((item) => isBookable(item, cutoffHours, now)) ?? shown[0] ?? null
  if (!session) return { session: null, dateKey: null, monthKey: null }
  return {
    session,
    dateKey: singaporeDateKey(session.starts_at),
    monthKey: singaporeMonthKey(session.starts_at),
  }
}
