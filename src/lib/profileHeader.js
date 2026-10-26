import { HOST_SESSIONS_SELECT } from './listingDelete'
import { monthStartIso } from './hostingDashboard'
import { singaporeDateKey } from './sessionCalendar'

export function hostProfileStats(reviews) {
  const reviewCount = reviews?.length ?? 0
  const average = reviewCount
    ? Number((reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviewCount).toFixed(1))
    : null
  return { average, reviewCount }
}

/** Same sessions+bookings read Hosting uses, only for the owner. */
export function fetchHostOwnSessions(client, listingIds, now = Date.now()) {
  return client
    .from('sessions')
    .select(HOST_SESSIONS_SELECT)
    .in('listing_id', listingIds)
    .neq('status', 'cancelled')
    .gte('starts_at', monthStartIso(now))
    .order('starts_at', { ascending: true })
}

export function sessionListingTitle(session, listings) {
  const embedded = session?.listings
  const fromJoin = Array.isArray(embedded) ? embedded[0]?.title : embedded?.title
  if (typeof fromJoin === 'string' && fromJoin.trim()) return fromJoin.trim()
  const listing = (listings ?? []).find((row) => row.id === session?.listing_id)
  return typeof listing?.title === 'string' ? listing.title.trim() : ''
}

function isOpenSession(session) {
  return !session?.status || session.status === 'open'
}

export function confirmedBookingCount(session) {
  return (session?.bookings ?? []).filter((booking) => booking.status === 'confirmed').length
}

/**
 * Public: hollow 'open' for open future sessions only.
 * Own: 'booked' if any session that day has a confirmed booking; 'open' only
 * for a still-to-come open session. Past Singapore days never get an open ring.
 */
export function calendarDayMarks(sessions, { publicView = true, now = Date.now() } = {}) {
  const marks = {}
  const todayKey = singaporeDateKey(now)
  for (const session of sessions ?? []) {
    const dateKey = singaporeDateKey(session.starts_at)
    const upcoming = new Date(session.starts_at).getTime() > now
    if (publicView) {
      if (!isOpenSession(session) || !upcoming) continue
      marks[dateKey] = 'open'
      continue
    }
    const booked = confirmedBookingCount(session) > 0
    if (booked) {
      marks[dateKey] = 'booked'
      continue
    }
    if (dateKey < todayKey || !upcoming) continue
    if (isOpenSession(session) && marks[dateKey] !== 'booked') {
      marks[dateKey] = 'open'
    }
  }
  return marks
}

export function sessionsOnDay(sessions, dateKey, { publicView = true, now = Date.now() } = {}) {
  return (sessions ?? [])
    .filter((session) => singaporeDateKey(session.starts_at) === dateKey)
    .filter((session) => {
      if (!publicView) return session.status !== 'cancelled'
      return isOpenSession(session) && new Date(session.starts_at).getTime() > now
    })
    .slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
}
