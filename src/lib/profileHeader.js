export const HOST_OPEN_SESSIONS_LIMIT = 80
export const HOST_OPEN_SESSIONS_SELECT = 'id, listing_id, starts_at, status, listings!inner(title)'
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export function hostProfileStats(reviews, listings) {
  const listingCount = listings?.length ?? 0
  if (listingCount === 0) return null
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

function sessionListingTitle(session, listings) {
  const embedded = session?.listings
  const fromJoin = Array.isArray(embedded) ? embedded[0]?.title : embedded?.title
  if (typeof fromJoin === 'string' && fromJoin.trim()) return fromJoin.trim()
  const listing = (listings ?? []).find((row) => row.id === session?.listing_id)
  return typeof listing?.title === 'string' ? listing.title.trim() : ''
}

function isOpenSession(session) {
  return !session?.status || session.status === 'open'
}

export function hostingSummary({ reviews, listings, sessions, now = Date.now() }) {
  const stats = hostProfileStats(reviews, listings)
  if (!stats) return null

  const upcoming = (sessions ?? [])
    .filter((session) => isOpenSession(session) && new Date(session.starts_at).getTime() > now)
    .slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  const next = upcoming[0] ?? null
  const cutoff = now + THIRTY_DAYS_MS
  const openIn30Days = upcoming.filter(
    (session) => new Date(session.starts_at).getTime() <= cutoff,
  ).length

  return {
    next: next
      ? {
          listingId: next.listing_id,
          title: sessionListingTitle(next, listings),
          startsAt: next.starts_at,
        }
      : null,
    openIn30Days,
    listingCount: stats.listingCount,
    average: stats.average,
    reviewCount: stats.reviewCount,
  }
}
