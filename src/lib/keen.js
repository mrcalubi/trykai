/**
 * "I'm keen" on listings with no upcoming sessions (00032). Words and limits
 * come from _shared/interest.ts so the page, the Edge Functions and the
 * emails cannot drift.
 */

import {
  INTEREST_DAY_LABELS,
  INTEREST_DAYS,
  INTEREST_MAX_GROUP,
  INTEREST_TIME_LABELS,
  INTEREST_TIMES,
  interestTallies,
  keenBadge,
} from '../../supabase/functions/_shared/interest.ts'
import { isRecentlyListed, nextSessionLabel } from './browseFilters'

export {
  INTEREST_DAY_LABELS,
  INTEREST_DAYS,
  INTEREST_MAX_GROUP,
  INTEREST_TIME_LABELS,
  INTEREST_TIMES,
  interestTallies,
  keenBadge,
}

export const NO_DATES_LABEL = 'No dates yet'

/**
 * Browse card pill. A listing with no dates and 2+ keen guests shows "4 keen"
 * there (it wins over "New"), so the date slot can stay a short "No dates yet"
 * and the area is never squeezed on a phone.
 */
export function browseFlag(listing, keenCount, now = new Date(), showNew = true) {
  const badge = nextSessionLabel(listing, now) ? '' : keenBadge(keenCount)
  if (badge) return badge
  return showNew && isRecentlyListed(listing, now) ? 'New' : undefined
}

/** listing_keen_counts rows → { [listingId]: count }. */
export function keenCountsById(rows) {
  const byId = {}
  for (const row of rows ?? []) {
    const count = Number(row?.keen_count)
    if (row?.listing_id && Number.isFinite(count) && count > 0) byId[row.listing_id] = count
  }
  return byId
}

/** host_listing_interest rows → { [listingId]: summary }. */
export function hostInterestById(rows) {
  const byId = {}
  for (const row of rows ?? []) {
    if (row?.listing_id && Number(row.keen_count) > 0) byId[row.listing_id] = row
  }
  return byId
}

export function toggleChoice(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function hostBannerLine(summary) {
  const count = Number(summary?.keen_count) || 0
  const who = count === 1 ? '1 person is' : `${count} people are`
  const { days, times } = interestTallies(summary)
  const when = [days, times].filter(Boolean).join(', ')
  return when ? `${who} keen. When suits them: ${when}.` : `${who} keen.`
}

export function keenNotifiedLine(count) {
  return count === 1
    ? "We've emailed the 1 guest who was keen."
    : `We've emailed the ${count} guests who were keen.`
}

export const KEEN_ERROR = 'Could not send that. Please try again.'
