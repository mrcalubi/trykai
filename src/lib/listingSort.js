import { singaporeDateKey } from './sessionCalendar'

function upcomingStartTimes(listing, nowMs) {
  return (listing.sessions ?? [])
    .filter((session) => session?.status === 'open')
    .map((session) => new Date(session.starts_at).getTime())
    .filter((startMs) => Number.isFinite(startMs) && startMs > nowMs)
}

function compareBrowseRank(a, b) {
  if (a.nextDateKey !== b.nextDateKey) {
    if (a.nextDateKey === null) return 1
    if (b.nextDateKey === null) return -1
    return a.nextDateKey < b.nextDateKey ? -1 : 1
  }
  return b.upcomingCount - a.upcomingCount
}

/**
 * Browse order for the home page:
 *   1. Soonest upcoming session, compared by Singapore calendar day.
 *   2. On the same day, more upcoming sessions first.
 *   3. Listings with no upcoming sessions last.
 * Only open sessions that have not started count. Ties keep the incoming order,
 * which the home query supplies newest-listing-first.
 */
export function sortListingsForBrowse(listings, now = new Date()) {
  const nowMs = now.getTime()
  return listings
    .map((listing) => {
      const startTimes = upcomingStartTimes(listing, nowMs)
      return {
        listing,
        nextDateKey: startTimes.length
          ? singaporeDateKey(Math.min(...startTimes))
          : null,
        upcomingCount: startTimes.length,
      }
    })
    .sort(compareBrowseRank)
    .map(({ listing }) => listing)
}
