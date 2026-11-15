import { isBookingClosed } from './bookingCutoff'
import { singaporeDateKey, singaporeMonthKey } from './sessionCalendar'

/**
 * The booking calendar for a listing with classes. Every upcoming date is
 * loaded at once, so the calendar opens on a real date, pages only between
 * months that have dates, and the class filter can jump to its next date.
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

/** `YYYY-MM` keys of the months that have dates, in order. */
export function monthsWithDates(sessions) {
  return [...new Set((sessions ?? []).map((session) => singaporeMonthKey(session.starts_at)))].sort()
}

/** { [dateKey]: sessions } for one month. */
export function datesInMonth(sessions, monthKey) {
  const byDay = {}
  for (const session of sessions ?? []) {
    if (singaporeMonthKey(session.starts_at) !== monthKey) continue
    const key = singaporeDateKey(session.starts_at)
    ;(byDay[key] ??= []).push(session)
  }
  return byDay
}

/** More than one class on a day: the calendar marks it with a dot. */
export function hasSeveralClasses(daySessions) {
  return new Set((daySessions ?? []).map((session) => session.type_id ?? 'none')).size > 1
}

/** The first session of a day the guest can book, else its first session. */
export function firstOfDay(daySessions, cutoffHours, now = Date.now()) {
  return (daySessions ?? []).find((session) => isBookable(session, cutoffHours, now)) ?? daySessions?.[0] ?? null
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

/** "6 dates this month". */
export function monthDatesLabel(count) {
  return `${count} ${count === 1 ? 'date' : 'dates'} this month`
}
