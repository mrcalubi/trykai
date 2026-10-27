import { singaporeDateKey } from './sessionCalendar'

/**
 * Banner colours (DECISIONS.md, 27 October 2026). Each is a soft field with
 * two larger circles, no scattered icons. `null` in the database means sand.
 */
export const BANNER_PRESETS = [
  { id: 'coral', label: 'Coral', bg: '#F6E3D9', a: '#F0D3C4', b: '#F9EAE2' },
  { id: 'sand', label: 'Sand', bg: '#EBE5D8', a: '#E3DBCB', b: '#F1ECE2' },
  { id: 'sky', label: 'Sky', bg: '#DFE4EE', a: '#D3DAE8', b: '#E9EDF4' },
  { id: 'mint', label: 'Mint', bg: '#D3E0D6', a: '#C6D6CA', b: '#DFE8E1' },
  { id: 'lilac', label: 'Lilac', bg: '#D9D3E3', a: '#CEC6DB', b: '#E3DEEB' },
  { id: 'navy', label: 'Navy', bg: '#16264B', a: '#1E3160', b: '#22366A' },
  { id: 'clay', label: 'Clay', bg: '#E7CDBD', a: '#DFBFAB', b: '#EED9CC' },
]

export const DEFAULT_BANNER = 'sand'

export function bannerPreset(id) {
  return BANNER_PRESETS.find((preset) => preset.id === id) ?? BANNER_PRESETS[1]
}

export const BANNER_ASPECT = 4

/* ------------------------------------------------------------------------ */
/* Socials                                                                  */
/* ------------------------------------------------------------------------ */

export const SOCIALS = {
  instagram: {
    label: 'Instagram',
    pattern: /^[A-Za-z0-9._]{1,30}$/,
    hosts: ['instagram.com', 'www.instagram.com', 'instagr.am'],
    url: (handle) => `https://www.instagram.com/${handle}/`,
    error: 'Use letters, numbers, full stops or underscores (30 at most).',
  },
  tiktok: {
    label: 'TikTok',
    pattern: /^[A-Za-z0-9._]{2,24}$/,
    hosts: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'],
    url: (handle) => `https://www.tiktok.com/@${handle}`,
    error: 'Use 2 to 24 letters, numbers, full stops or underscores.',
  },
}

/**
 * People paste all sorts: "@name", "name ", or the whole profile link.
 * Keep just the handle so the column check always sees the same shape.
 */
export function normalizeHandle(kind, raw) {
  let value = String(raw ?? '').trim()
  if (!value) return ''
  const social = SOCIALS[kind]
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`)
    if (social?.hosts.includes(parsed.hostname.toLowerCase())) {
      value = parsed.pathname.split('/').filter(Boolean)[0] ?? ''
    }
  } catch {
    // Not a link; treat it as a handle.
  }
  return value.replace(/^@+/, '').trim()
}

export function handleError(kind, handle) {
  if (!handle) return ''
  return SOCIALS[kind].pattern.test(handle) ? '' : SOCIALS[kind].error
}

export function socialUrl(kind, handle) {
  return handle ? SOCIALS[kind].url(handle) : ''
}

/* ------------------------------------------------------------------------ */
/* Header facts                                                             */
/* ------------------------------------------------------------------------ */

export function hostAreasLine(listings, max = 3) {
  const areas = []
  for (const listing of listings ?? []) {
    const area = typeof listing?.area === 'string' ? listing.area.trim() : ''
    if (area && !areas.includes(area)) areas.push(area)
  }
  if (areas.length === 0) return ''
  const shown = areas.slice(0, max).join(', ')
  const more = areas.length - max
  return more > 0 ? `Hosts in ${shown} +${more} more` : `Hosts in ${shown}`
}

export function joinMonthLabel(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-SG', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Singapore',
  })
}

export function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data && typeof data === 'object' ? data : null
}

export function rpcBoolean(data) {
  if (Array.isArray(data)) return data[0] === true
  return data === true
}

/** Owner-only numbers. Missing RPC (migration not applied) reads as null. */
export function profileStatsFromRpc(data, error) {
  if (error) return null
  const row = firstRow(data)
  if (!row) return null
  const count = (value) => Math.max(0, Number(value) || 0)
  return {
    guestsHosted: count(row.guests_hosted),
    repeatGuests: count(row.repeat_guests),
    sessionsAttended: count(row.sessions_attended),
    categoriesTried: count(row.categories_tried),
    reviewsWritten: count(row.reviews_written),
    joinedAt: row.joined_at ?? null,
  }
}

/* ------------------------------------------------------------------------ */
/* Reviews                                                                  */
/* ------------------------------------------------------------------------ */

function newestFirst(reviews) {
  return (reviews ?? [])
    .slice()
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
}

/** The host's pick if it is still one of their reviews, else the latest 5-star. */
export function featuredReview(reviews, featuredId) {
  const list = reviews ?? []
  if (featuredId) {
    const chosen = list.find((review) => review.id === featuredId)
    if (chosen) return chosen
  }
  return newestFirst(list).find((review) => Number(review.rating) === 5) ?? null
}

export function reviewerName(review) {
  const name = review?.users?.full_name
  return typeof name === 'string' && name.trim() ? name.trim() : 'A guest'
}

export function starsText(rating) {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)))
  return '★'.repeat(value) + '☆'.repeat(5 - value)
}

export function clip(text, max = 120) {
  const value = String(text ?? '').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

/* ------------------------------------------------------------------------ */
/* Milestones                                                               */
/* ------------------------------------------------------------------------ */

export function hostMedals({ sessionsHeld = 0, reviews = [] } = {}) {
  const held = Number(sessionsHeld) || 0
  const fiveStar = (reviews ?? []).some((review) => Number(review.rating) === 5)
  return [
    { id: 'first', label: 'First session', mark: '1', scheme: 'coral', earned: held >= 1, goal: 1 },
    { id: 'ten', label: '10 sessions', mark: '10', scheme: 'blue', earned: held >= 10, goal: 10 },
    { id: 'five-star', label: 'First 5-star', mark: 'star', scheme: 'green', earned: fiveStar },
    { id: 'fifty', label: '50 sessions', mark: '50', scheme: 'coral', earned: held >= 50, goal: 50 },
  ]
}

/** Joined in TryKai's launch year. */
export const OG_CUTOFF = '2027-01-01T00:00:00+08:00'

export function guestMedals({ sessionsAttended = 0, categoriesTried = 0, joinedAt = null } = {}) {
  const attended = Number(sessionsAttended) || 0
  const og = Boolean(joinedAt) && new Date(joinedAt) < new Date(OG_CUTOFF)
  return [
    { id: 'first', label: 'First session', mark: '1', scheme: 'coral', earned: attended >= 1, goal: 1 },
    {
      id: 'explorer',
      label: 'Explorer',
      mark: '3',
      scheme: 'blue',
      earned: (Number(categoriesTried) || 0) >= 3,
    },
    { id: 'five', label: '5 sessions', mark: '5', scheme: 'green', earned: attended >= 5, goal: 5 },
    { id: 'og', label: 'TryKai OG', mark: 'OG', scheme: 'coral', earned: og },
  ]
}

/** One line under the medals: what to do next. */
export function medalHint(medals, count, { host = true, nextSessionLabel = '' } = {}) {
  const next = medals.find((medal) => !medal.earned && medal.goal)
  if (!next) return ''
  const done = Number(count) || 0
  if (done === 0) {
    if (host) {
      return nextSessionLabel
        ? `Host your first session on ${nextSessionLabel} to earn your first medal.`
        : 'Host your first session to earn your first medal.'
    }
    return 'Book your first session to earn your first medal.'
  }
  const left = next.goal - done
  return `${left} more ${left === 1 ? 'session' : 'sessions'} to unlock ${next.label}.`
}

/* ------------------------------------------------------------------------ */
/* Sessions                                                                 */
/* ------------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000

export function comingUpSessions(sessions, { now = Date.now(), days = 30, limit = 3 } = {}) {
  const end = now + days * DAY_MS
  return (sessions ?? [])
    .filter((session) => !session.status || session.status === 'open')
    .filter((session) => {
      const start = new Date(session.starts_at).getTime()
      return start > now && start <= end
    })
    .filter((session) => session.spots_remaining == null || Number(session.spots_remaining) > 0)
    .slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    .slice(0, limit)
}

export function spotsLine(spots) {
  if (spots == null) return ''
  const left = Number(spots)
  if (!Number.isFinite(left) || left <= 0) return ''
  if (left <= 3) return `${left} ${left === 1 ? 'spot' : 'spots'} left`
  return `${left} spots`
}

/** Weekday and day number for the little date chips, in Singapore time. */
export function dateChip(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { weekday: '', day: '' }
  return {
    weekday: date.toLocaleDateString('en-SG', { weekday: 'short', timeZone: 'Asia/Singapore' }),
    day: date.toLocaleDateString('en-SG', { day: 'numeric', timeZone: 'Asia/Singapore' }),
  }
}

export function shortDay(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Singapore',
  })
}

/** Calendar marks for a guest: green for upcoming, grey for attended. */
export function guestCalendarMarks(bookings, now = Date.now()) {
  const marks = {}
  for (const booking of bookings ?? []) {
    if (booking.status !== 'confirmed') continue
    const startsAt = booking.sessions?.starts_at
    if (!startsAt) continue
    const key = singaporeDateKey(startsAt)
    const upcoming = new Date(startsAt).getTime() > now
    if (upcoming) marks[key] = 'booked'
    else if (marks[key] !== 'booked') marks[key] = 'past'
  }
  return marks
}

export function splitGuestBookings(bookings, now = Date.now()) {
  const upcoming = []
  const past = []
  for (const booking of bookings ?? []) {
    const startsAt = booking.sessions?.starts_at
    const isUpcoming =
      booking.status !== 'cancelled' && startsAt && new Date(startsAt).getTime() > now
    if (isUpcoming) upcoming.push(booking)
    else past.push(booking)
  }
  const at = (booking) => new Date(booking.sessions?.starts_at ?? 0).getTime()
  upcoming.sort((a, b) => at(a) - at(b))
  past.sort((a, b) => at(b) - at(a))
  return { upcoming, past }
}
