import { singaporeDateKey } from './sessionCalendar'
import { formatSessionDay } from './sessionDate'
import { guestFacingPriceCents } from './pricing'

const DAY_MS = 24 * 60 * 60 * 1000

/** All-in price at or under which a listing counts as "Under $30". */
export const BUDGET_LIMIT_CENTS = 3000

function upcoming(listing, now) {
  const nowMs = new Date(now).getTime()
  return (listing.sessions ?? [])
    .filter((session) => session?.starts_at && new Date(session.starts_at).getTime() > nowMs)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
}

/**
 * Singapore date keys for "this weekend": the coming Saturday and Sunday, or
 * what is left of the weekend when today already is one.
 */
export function weekendDateKeys(now = new Date()) {
  const nowMs = new Date(now).getTime()
  // Day of week in Singapore (UTC+8, no daylight saving).
  const dayOfWeek = new Date(nowMs + 8 * 60 * 60 * 1000).getUTCDay()
  const offsets = dayOfWeek === 0 ? [0] : dayOfWeek === 6 ? [0, 1] : [6 - dayOfWeek, 7 - dayOfWeek]
  return new Set(offsets.map((days) => singaporeDateKey(nowMs + days * DAY_MS)))
}

export function hasSessionThisWeekend(listing, now = new Date()) {
  const keys = weekendDateKeys(now)
  return upcoming(listing, now).some((session) => keys.has(singaporeDateKey(session.starts_at)))
}

export function isBudgetFriendly(listing) {
  const price = Number(listing.price_per_person)
  if (!Number.isFinite(price) || price <= 0) return false
  return guestFacingPriceCents(price) <= BUDGET_LIMIT_CENTS
}

/** "Sat, 25 Oct" for the listing's soonest upcoming session, else ''. */
export function nextSessionLabel(listing, now = new Date()) {
  const next = upcoming(listing, now)[0]
  return next ? formatSessionDay(next.starts_at, new Date(now).getTime()) : ''
}

/** True when the listing went live within the last 30 days. */
export function isRecentlyListed(listing, now = new Date()) {
  const created = new Date(listing.created_at ?? NaN).getTime()
  if (Number.isNaN(created)) return false
  return new Date(now).getTime() - created <= 30 * DAY_MS
}
