// "I'm keen" on a listing with no upcoming sessions (listing-interest,
// notify-interested, migration 00032). Shared with the listing page so the
// chips, the server and the emails agree on the same words.

export const INTEREST_DAYS = ['weekday', 'weekend'] as const
export const INTEREST_TIMES = ['morning', 'afternoon', 'evening'] as const
export type InterestDay = (typeof INTEREST_DAYS)[number]
export type InterestTime = (typeof INTEREST_TIMES)[number]

export const INTEREST_DAY_LABELS: Record<InterestDay, string> = {
  weekday: 'Weekdays',
  weekend: 'Weekends',
}
export const INTEREST_TIME_LABELS: Record<InterestTime, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

export const INTEREST_MAX_GROUP = 10
/** Interest older than this stops counting (00032 uses the same window). */
export const INTEREST_OPEN_DAYS = 30
/** The host is emailed about keen guests at most this often, per listing. */
export const HOST_INTEREST_EMAIL_GAP_MS = 24 * 60 * 60 * 1000
/** Browse and the listing page show the count only from this many. */
export const KEEN_COUNT_MIN_SHOWN = 2

export interface InterestRequest {
  listingId: string
  days: InterestDay[]
  times: InterestTime[]
  groupSize: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function pickAllowed<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null
  const picked = new Set<T>()
  for (const item of value) {
    if (!allowed.includes(item as T)) return null
    picked.add(item as T)
  }
  // Keep the canonical order so stored rows and emails read the same way.
  return allowed.filter((item) => picked.has(item))
}

export function parseInterestRequest(
  body: unknown,
): { ok: true; value: InterestRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request' }
  const raw = body as Record<string, unknown>
  const listingId = typeof raw.listing_id === 'string' ? raw.listing_id : ''
  if (!UUID.test(listingId)) return { ok: false, error: 'listing_id is required' }

  const days = pickAllowed(raw.days, INTEREST_DAYS)
  if (!days) return { ok: false, error: 'Unknown day choice' }
  const times = pickAllowed(raw.times, INTEREST_TIMES)
  if (!times) return { ok: false, error: 'Unknown time choice' }

  const group = raw.group_size === undefined ? 1 : Number(raw.group_size)
  if (!Number.isInteger(group) || group < 1 || group > INTEREST_MAX_GROUP) {
    return { ok: false, error: `Group size must be 1 to ${INTEREST_MAX_GROUP}` }
  }
  return { ok: true, value: { listingId, days, times, groupSize: group } }
}

export function interestDecision(options: {
  callerId: string | null | undefined
  listing: { host_id: string; is_active: boolean; review_status?: string | null } | null | undefined
  hostSuspended: boolean
}): { ok: true } | { ok: false; httpStatus: number; error: string } {
  if (!options.callerId) return { ok: false, httpStatus: 401, error: 'Sign in to show interest' }
  // A listing still in review (00036) is not public, so it is "not found" here too.
  if (
    !options.listing ||
    !options.listing.is_active ||
    options.listing.review_status !== 'approved' ||
    options.hostSuspended
  ) {
    return { ok: false, httpStatus: 404, error: 'Listing not found' }
  }
  if (options.listing.host_id === options.callerId) {
    return { ok: false, httpStatus: 400, error: 'This is your own listing' }
  }
  return { ok: true }
}

export function shouldEmailHost(
  lastNotifiedAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastNotifiedAt) return true
  const last = new Date(lastNotifiedAt).getTime()
  if (Number.isNaN(last)) return true
  return nowMs - last >= HOST_INTEREST_EMAIL_GAP_MS
}

export interface InterestSummary {
  keen_count: number
  weekday: number
  weekend: number
  morning: number
  afternoon: number
  evening: number
  min_group: number | null
  max_group: number | null
}

/** Aggregate open rows the same way host_listing_interest() does in SQL. */
export function summarizeInterest(
  rows: Array<{ days?: string[] | null; times?: string[] | null; group_size?: number | null }>,
): InterestSummary {
  const summary: InterestSummary = {
    keen_count: rows.length,
    weekday: 0,
    weekend: 0,
    morning: 0,
    afternoon: 0,
    evening: 0,
    min_group: null,
    max_group: null,
  }
  for (const row of rows) {
    for (const day of INTEREST_DAYS) if (row.days?.includes(day)) summary[day] += 1
    for (const time of INTEREST_TIMES) if (row.times?.includes(time)) summary[time] += 1
    const size = Number(row.group_size)
    if (Number.isInteger(size) && size > 0) {
      summary.min_group = summary.min_group === null ? size : Math.min(summary.min_group, size)
      summary.max_group = summary.max_group === null ? size : Math.max(summary.max_group, size)
    }
  }
  return summary
}

function tally(parts: Array<[string, number]>): string {
  return parts
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${label} ${count}`)
    .join(' · ')
}

/** "Weekends 3 · Weekdays 1" and "Evening 3 · Morning 1"; empty when nobody picked. */
export function interestTallies(summary: InterestSummary): { days: string; times: string } {
  return {
    days: tally(INTEREST_DAYS.map((day) => [INTEREST_DAY_LABELS[day], summary[day]])),
    times: tally(INTEREST_TIMES.map((time) => [INTEREST_TIME_LABELS[time], summary[time]])),
  }
}

export function groupSizeRange(summary: InterestSummary): string {
  const { min_group: min, max_group: max } = summary
  if (min === null || max === null) return ''
  if (max <= 1) return 'Solo'
  return min === max ? `Groups of ${max}` : `Groups of ${min} to ${max}`
}

export function keenPeopleLine(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  if (n === 1) return 'Someone is keen'
  return `${n} people are keen`
}

/** "4 keen" from KEEN_COUNT_MIN_SHOWN up; nothing below, so a card never says "1 keen". */
export function keenBadge(count: number | null | undefined): string {
  const n = Math.floor(Number(count) || 0)
  return n >= KEEN_COUNT_MIN_SHOWN ? `${n} keen` : ''
}
