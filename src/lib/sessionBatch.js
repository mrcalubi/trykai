/**
 * Bulk-create independent sessions. No series row: each date × time is a
 * normal session. The calendar window matches PayNow (tomorrow through
 * today + 80 days in Singapore).
 */

import { PAYNOW_MAX_DAYS_AHEAD } from './pricing'
import { formatSessionDateTime, formatSessionDay, formatSessionTime } from './sessionDate'
import { singaporeDateKey, singaporeMonthKey } from './sessionCalendar'

export const SESSION_BATCH_MAX = 40
export const SESSION_BATCH_MAX_MESSAGE = `You can create at most ${SESSION_BATCH_MAX} sessions at a time.`

export const WEEKDAYS = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 7, label: 'Sun' },
]

export const SKIP_EXISTING = 'clashes with an existing session'
export const SKIP_BOOKED = 'clashes with a booked session'
export const SKIP_BATCH = 'clashes with another session in this batch'
export const SKIP_PAST = 'in the past'

const SINGAPORE_NOON = 'T12:00:00+08:00'

function singaporeNoon(dateKey) {
  return new Date(`${dateKey}${SINGAPORE_NOON}`)
}

/** Add calendar days to a `YYYY-MM-DD` Singapore date key. */
export function addSingaporeDays(dateKey, days) {
  const date = singaporeNoon(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return singaporeDateKey(date)
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function singaporeWeekday(dateKey) {
  const utcDay = singaporeNoon(dateKey).getUTCDay()
  return utcDay === 0 ? 7 : utcDay
}

/** Tomorrow through today + 80 days, Singapore calendar dates. */
export function selectableDateWindow(now = Date.now()) {
  const today = singaporeDateKey(now)
  return {
    todayKey: today,
    minDateKey: addSingaporeDays(today, 1),
    maxDateKey: addSingaporeDays(today, PAYNOW_MAX_DAYS_AHEAD),
  }
}

export function isSelectableDateKey(dateKey, now = Date.now()) {
  if (!dateKey) return false
  const { minDateKey, maxDateKey } = selectableDateWindow(now)
  return dateKey >= minDateKey && dateKey <= maxDateKey
}

export function nextWeekdayOnOrAfter(fromDateKey, weekday) {
  let dateKey = fromDateKey
  for (let i = 0; i < 7; i += 1) {
    if (singaporeWeekday(dateKey) === weekday) return dateKey
    dateKey = addSingaporeDays(dateKey, 1)
  }
  return fromDateKey
}

/**
 * Next `forWeeks` occurrences of each weekday, stepping by `everyWeeks`,
 * clipped to the 80-day window. Does not invent a series — it only lists dates.
 */
export function generateRecurringDates({
  weekdays = [],
  everyWeeks = 1,
  forWeeks = 1,
  now = Date.now(),
} = {}) {
  const interval = everyWeeks === 2 ? 2 : 1
  const weeks = Math.max(0, Math.floor(Number(forWeeks)) || 0)
  const { minDateKey, maxDateKey } = selectableDateWindow(now)
  const dates = new Set()

  for (const weekday of weekdays) {
    if (!WEEKDAYS.some((day) => day.id === weekday)) continue
    let dateKey = nextWeekdayOnOrAfter(minDateKey, weekday)
    for (let week = 0; week < weeks; week += 1) {
      if (dateKey <= maxDateKey) dates.add(dateKey)
      dateKey = addSingaporeDays(dateKey, interval * 7)
    }
  }

  return [...dates].sort()
}

export function singaporeDateTime(dateKey, time) {
  if (!dateKey || !time) return new Date(Number.NaN)
  return new Date(`${dateKey}T${time}:00+08:00`)
}

/** `HH:MM` for a date input, Singapore time. */
export function singaporeTimeValue(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Singapore',
  }).formatToParts(date)
  const hour = parts.find((part) => part.type === 'hour')?.value
  const minute = parts.find((part) => part.type === 'minute')?.value
  if (!hour || !minute) return ''
  return `${hour}:${minute}`
}

/** Same times on every date. Callers and tests can keep `{ dateKeys, times }`. */
export function timesByDateFromLists(dateKeys = [], times = []) {
  const map = {}
  for (const dateKey of dateKeys) {
    if (!dateKey) continue
    map[dateKey] = [...times]
  }
  return map
}

/** One start per dateKey × that date's times. Dates are sorted. Empty times are skipped. */
export function buildSessionStarts(timesByDate = {}) {
  const starts = []
  for (const dateKey of Object.keys(timesByDate).sort()) {
    for (const time of timesByDate[dateKey] ?? []) {
      if (!time) continue
      starts.push({
        dateKey,
        time,
        startsAt: singaporeDateTime(dateKey, time),
      })
    }
  }
  return starts
}

export function intervalsOverlap(aStartMs, aDurationMins, bStartMs, bDurationMins) {
  const aEnd = aStartMs + aDurationMins * 60_000
  const bEnd = bStartMs + bDurationMins * 60_000
  return aStartMs < bEnd && bStartMs < aEnd
}

function existingDuration(session, fallbackMins) {
  const mins = Number(session.duration_mins)
  return Number.isInteger(mins) && mins >= 1 ? mins : fallbackMins
}

function hasConfirmedBooking(session) {
  return (session.bookings ?? []).some((booking) => booking.status === 'confirmed')
}

/**
 * Preview a batch: mark past, existing clashes, and in-batch clashes.
 * Earlier starts in the batch are kept when two proposed times overlap.
 *
 * With `listingId` (00033, shared availability): only this listing's own
 * sessions and sessions with a confirmed booking count as clashes. An unbooked
 * session on another of the host's listings may share the time; the first
 * booking decides which listing gets it, so the item is kept and `sharedWith`
 * names those listings. Without `listingId`, any of the host's sessions clash.
 */
export function previewSessionBatch({
  timesByDate,
  dateKeys,
  times,
  durationMins,
  existingSessions = [],
  listingId,
  now = Date.now(),
} = {}) {
  const duration = Number(durationMins)
  const starts = buildSessionStarts(timesByDate ?? timesByDateFromLists(dateKeys, times))

  if (starts.length > SESSION_BATCH_MAX) {
    return { ok: false, error: SESSION_BATCH_MAX_MESSAGE, accepted: [], skipped: [] }
  }

  const existing = existingSessions.filter((session) => session.status !== 'cancelled')
  const accepted = []
  const skipped = []

  for (const item of starts) {
    const startMs = item.startsAt.getTime()
    if (!Number.isFinite(startMs) || startMs <= now) {
      skipped.push({ ...item, reason: SKIP_PAST })
      continue
    }

    const overlapping = existing.filter((session) => {
      const otherStart = new Date(session.starts_at).getTime()
      if (!Number.isFinite(otherStart)) return false
      return intervalsOverlap(
        startMs,
        duration,
        otherStart,
        existingDuration(session, duration),
      )
    })
    if (!listingId && overlapping.length > 0) {
      skipped.push({ ...item, reason: SKIP_EXISTING })
      continue
    }
    if (listingId && overlapping.some((session) => session.listing_id === listingId)) {
      skipped.push({ ...item, reason: SKIP_EXISTING })
      continue
    }
    if (listingId && overlapping.some(hasConfirmedBooking)) {
      skipped.push({ ...item, reason: SKIP_BOOKED })
      continue
    }
    const sharedWith = listingId
      ? [...new Set(overlapping.map((session) => session.listings?.title).filter(Boolean))]
      : []

    const clashesBatch = accepted.some((kept) =>
      intervalsOverlap(startMs, duration, kept.startsAt.getTime(), duration),
    )
    if (clashesBatch) {
      skipped.push({ ...item, reason: SKIP_BATCH })
      continue
    }

    accepted.push(sharedWith.length > 0 ? { ...item, sharedWith } : item)
  }

  return { ok: true, error: null, accepted, skipped }
}

/** Compact list label: "Sat 8 Nov 10:00 am". */
export function formatBatchWhen(startsAt, now = Date.now()) {
  const day = formatSessionDay(startsAt, now).replace(',', '')
  const time = formatSessionTime(startsAt)
  if (!day || !time) return ''
  return `${day} ${time}`
}

export function formatBatchSummary({ created = 0, skipped = [] } = {}, now = Date.now()) {
  const createdLabel =
    created === 1 ? 'Created 1 session.' : `Created ${created} sessions.`
  if (skipped.length === 0) return createdLabel

  const skipBits = skipped.map((item) => {
    const when = formatBatchWhen(item.startsAt, now)
    return `${when} (${item.reason})`
  })
  return `${createdLabel} Skipped ${skipped.length}: ${skipBits.join(', ')}`
}

export function skipReasonFromRpcMessage(message) {
  const text = message ?? ''
  if (/overlaps/i.test(text) || /overlap/i.test(text)) return SKIP_EXISTING
  if (/in the future/i.test(text)) return SKIP_PAST
  return text || SKIP_EXISTING
}

export function monthKeysInWindow(now = Date.now()) {
  const { minDateKey, maxDateKey } = selectableDateWindow(now)
  const keys = []
  let monthKey = singaporeMonthKey(`${minDateKey}${SINGAPORE_NOON}`)
  const lastMonth = singaporeMonthKey(`${maxDateKey}${SINGAPORE_NOON}`)
  while (monthKey <= lastMonth) {
    keys.push(monthKey)
    const [year, month] = monthKey.split('-').map(Number)
    const next = month === 12 ? [year + 1, 1] : [year, month + 1]
    monthKey = `${next[0]}-${String(next[1]).padStart(2, '0')}`
  }
  return keys
}

export { formatSessionDateTime, singaporeDateKey, singaporeMonthKey }
