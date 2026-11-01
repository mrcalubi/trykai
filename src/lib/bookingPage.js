import { calculateGuestRefund, formatCents } from './cancellationPolicy'
import { sessionHasEnded } from './reviewGate'
import { singaporeDateKey } from '../../supabase/functions/_shared/email.ts'
import { isBookingClosed, isPayNowTooFarAhead } from '../../supabase/functions/_shared/booking.ts'
import { sessionForReview } from './guestBookings'

export const RESCHEDULE_CUTOFF_HOURS = 48
export const BRING_STORAGE_PREFIX = 'trykai:bring:'

export function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function appleMapsUrl(address) {
  return `https://maps.apple.com/?q=${encodeURIComponent(address)}`
}

export function listingShareUrl(listingId, origin = globalThis.location?.origin) {
  const base = String(origin || '').replace(/\/$/, '')
  return `${base}/listings/${listingId}`
}

export function providedItems(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => String(item).trim()).filter((item) => item && item !== 'None')
}

export function bookingStatusLabel(booking, now = Date.now()) {
  if (booking?.status === 'cancelled') return 'Cancelled'
  if (booking?.status !== 'confirmed') return ''
  if (sessionHasEnded(sessionForReview(booking.sessions), now)) return 'Completed'
  return 'Confirmed'
}

export function bookingCountdown(startsAt, now = Date.now()) {
  const startKey = singaporeDateKey(startsAt)
  const nowKey = singaporeDateKey(now)
  if (!startKey || !nowKey) return ''
  if (startKey === nowKey) return 'Today'
  const start = new Date(`${startKey}T00:00:00+08:00`)
  const today = new Date(`${nowKey}T00:00:00+08:00`)
  const days = Math.round((start.getTime() - today.getTime()) / 86400000)
  if (days === 1) return 'Tomorrow'
  if (days > 1) return `In ${days} days`
  return ''
}

export function isBookingDayOf(startsAt, durationMins, now = Date.now()) {
  if (!startsAt || singaporeDateKey(startsAt) !== singaporeDateKey(now)) return false
  const start = new Date(startsAt).getTime()
  if (Number.isNaN(start)) return false
  if (now < new Date(`${singaporeDateKey(startsAt)}T00:00:00+08:00`).getTime()) return false
  const mins = Number(durationMins)
  const duration = Number.isFinite(mins) && mins > 0 ? mins : 120
  return now < start + duration * 60 * 1000
}

export function startsInCopy(startsAt, now = Date.now()) {
  const start = new Date(startsAt).getTime()
  if (Number.isNaN(start)) return ''
  const ms = start - now
  if (ms <= 0) return 'started'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `starts in ${mins} min`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  if (hours >= 24) {
    const days = Math.round(hours / 24)
    return days === 1 ? 'starts in 1 day' : `starts in ${days} days`
  }
  if (rem === 0) return hours === 1 ? 'starts in 1 hr' : `starts in ${hours} hr`
  return `starts in ${hours} hr ${rem} min`
}

export function dateTileParts(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return {
    weekday: date.toLocaleDateString('en-SG', { weekday: 'short', timeZone: 'Asia/Singapore' }),
    day: date.toLocaleDateString('en-SG', { day: 'numeric', timeZone: 'Asia/Singapore' }),
    month: date.toLocaleDateString('en-SG', { month: 'short', timeZone: 'Asia/Singapore' }),
  }
}

export function icsStamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function icsEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function bookingIcs({ title, startsAt, durationMins, address, bookingId, now = Date.now() }) {
  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return ''
  const mins = Number(durationMins)
  const duration = Number.isFinite(mins) && mins > 0 ? mins : 60
  const end = new Date(start.getTime() + duration * 60 * 1000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TryKai//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:booking-${bookingId}@trykai.sg`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(title || 'TryKai session')}`,
  ]
  if (address) lines.push(`LOCATION:${icsEscape(address)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadIcs(filename, content, doc = globalThis.document, urlApi = globalThis.URL) {
  if (!doc || !urlApi?.createObjectURL) return false
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const href = urlApi.createObjectURL(blob)
  const link = doc.createElement('a')
  link.href = href
  link.download = filename
  link.rel = 'noopener'
  doc.body.appendChild(link)
  link.click()
  link.remove()
  urlApi.revokeObjectURL(href)
  return true
}

export function bringStorageKey(bookingId) {
  return `${BRING_STORAGE_PREFIX}${bookingId}`
}

export function readBringChecks(bookingId, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(bringStorageKey(bookingId))
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function writeBringChecks(bookingId, items, storage = globalThis.localStorage) {
  try {
    storage.setItem(bringStorageKey(bookingId), JSON.stringify(items))
    return true
  } catch {
    return false
  }
}

export function rescheduleBlockReason(booking, now = Date.now()) {
  if (!booking || booking.status !== 'confirmed') return 'unavailable'
  if (booking.rescheduled_at) return 'already'
  const startsAt = booking.sessions?.starts_at
  if (!startsAt) return 'unavailable'
  const hoursUntil = (new Date(startsAt).getTime() - now) / (1000 * 60 * 60)
  if (hoursUntil <= RESCHEDULE_CUTOFF_HOURS) return 'too_late'
  return null
}

export function rescheduleBlockCopy(reason) {
  if (reason === 'already') return "You've already moved this booking once"
  if (reason === 'too_late') return 'Moving closes 48 hours before'
  return ''
}

export function isEligibleRescheduleSession(session, booking, now = Date.now()) {
  if (!session || !booking) return false
  if (session.id === booking.session_id) return false
  if (session.status !== 'open') return false
  if (!session.starts_at || new Date(session.starts_at).getTime() <= now) return false
  if ((session.spots_remaining ?? 0) < (booking.guests_count || 1)) return false
  if (booking.payment_rail === 'paynow') {
    const paidAt = Date.parse(booking.created_at)
    if (isPayNowTooFarAhead(session.starts_at, Number.isFinite(paidAt) ? paidAt : now)) return false
  }
  if (isBookingClosed(session.starts_at, booking.sessions?.listings?.booking_cutoff_hours, now)) {
    return false
  }
  return true
}

export function cancelNowCopy(totalAmount, startsAt, platformFee) {
  const refund = calculateGuestRefund(totalAmount, startsAt, platformFee)
  return `If you cancel now: ${formatCents(refund)} back`
}

export function cancelTiersSentence() {
  return 'Everything except the booking fee 48+ hours before, half at 24–48 hours, a quarter at 6–24 hours, nothing after that.'
}

export function isMissingRescheduleColumn(error) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  return /rescheduled_at|rescheduled_from_session_id|42703|PGRST204/i.test(text)
}

export function guestFirstName(name) {
  const word = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0]
  return word || 'A guest'
}
