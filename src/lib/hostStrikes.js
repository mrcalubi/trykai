/**
 * Host strike expiry (00039). An active strike is not removed and was given
 * in the last 12 months. Listings go down at 3 active strikes; expiry and
 * appeals never turn them back on.
 */

export const HOST_STRIKE_EXPIRY_MONTHS = 12

export function isActiveStrike(event, now = new Date()) {
  if (!event?.created_at || event.removed_at) return false
  const created = new Date(event.created_at)
  if (Number.isNaN(created.getTime())) return false
  const cutoff = new Date(now)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - HOST_STRIKE_EXPIRY_MONTHS)
  return created >= cutoff
}

export function activeStrikeCount(events, now = new Date()) {
  return (events ?? []).filter((event) => isActiveStrike(event, now)).length
}

export function strikesDeactivateListings(activeCount) {
  return activeCount >= 3
}
