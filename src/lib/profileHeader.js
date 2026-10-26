import { HOST_SESSIONS_SELECT } from './listingDelete'
import { monthStartIso } from './hostingDashboard'
import { singaporeDateKey } from './sessionCalendar'

export const HOST_OPEN_SESSIONS_LIMIT = 80
export const HOST_OPEN_SESSIONS_SELECT = 'id, listing_id, starts_at, status, listings!inner(title)'

export function hostProfileStats(reviews, listings) {
  const listingCount = listings?.length ?? 0
  const reviewCount = reviews?.length ?? 0
  const average = reviewCount
    ? Number((reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviewCount).toFixed(1))
    : null
  return { average, reviewCount, listingCount }
}

export function teachCategories(listings) {
  const seen = []
  for (const listing of listings ?? []) {
    const category = typeof listing.category === 'string' ? listing.category.trim() : ''
    if (category && !seen.includes(category)) seen.push(category)
  }
  return seen
}

export function fetchHostOpenSessions(client, hostId, now = new Date()) {
  return client
    .from('sessions')
    .select(HOST_OPEN_SESSIONS_SELECT)
    .eq('status', 'open')
    .gt('starts_at', now.toISOString())
    .eq('listings.host_id', hostId)
    .eq('listings.is_active', true)
    .eq('listings.review_status', 'approved')
    .order('starts_at', { ascending: true })
    .limit(HOST_OPEN_SESSIONS_LIMIT)
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

export function nextOpenSession(sessions, listings, now = Date.now()) {
  const upcoming = (sessions ?? [])
    .filter((session) => isOpenSession(session) && new Date(session.starts_at).getTime() > now)
    .slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  const next = upcoming[0]
  if (!next) return null
  return {
    listingId: next.listing_id,
    title: sessionListingTitle(next, listings),
    startsAt: next.starts_at,
  }
}

/**
 * Public: hollow 'open' for open future sessions only.
 * Own: 'booked' if any session that day has a confirmed booking, else 'open'
 * for open sessions with no confirmed bookings.
 */
export function calendarDayMarks(sessions, { publicView = true, now = Date.now() } = {}) {
  const marks = {}
  for (const session of sessions ?? []) {
    const dateKey = singaporeDateKey(session.starts_at)
    if (publicView) {
      if (!isOpenSession(session) || new Date(session.starts_at).getTime() <= now) continue
      marks[dateKey] = 'open'
      continue
    }
    const booked = confirmedBookingCount(session) > 0
    if (booked) {
      marks[dateKey] = 'booked'
      continue
    }
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
