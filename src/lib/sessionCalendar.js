// Calendar maths for session dates, always in Singapore time. Singapore has no
// daylight saving, so a fixed +08:00 offset maps local midnight exactly.
const SINGAPORE_OFFSET = '+08:00'
const TIME_ZONE = 'Asia/Singapore'

// en-CA formats as YYYY-MM-DD, so date keys compare correctly as strings.
const dateKeyFormat = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TIME_ZONE,
})

const monthTitleFormat = new Intl.DateTimeFormat('en-SG', {
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE,
})

const dayLabelFormat = new Intl.DateTimeFormat('en-SG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: TIME_ZONE,
})

const dayTitleFormat = new Intl.DateTimeFormat('en-SG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: TIME_ZONE,
})

/** `YYYY-MM-DD` for the Singapore calendar day of an ISO string, Date or epoch ms. */
export function singaporeDateKey(value) {
  return dateKeyFormat.format(new Date(value))
}

/** `YYYY-MM` for the Singapore calendar month of an ISO string, Date or epoch ms. */
export function singaporeMonthKey(value) {
  return singaporeDateKey(value).slice(0, 7)
}

function parseMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  return { year, month }
}

export function shiftMonth(monthKey, delta) {
  const { year, month } = parseMonthKey(monthKey)
  const index = year * 12 + (month - 1) + delta
  const shiftedYear = Math.floor(index / 12)
  const shiftedMonth = (index % 12) + 1
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, '0')}`
}

function singaporeMidnight(dateKey) {
  return new Date(`${dateKey}T00:00:00${SINGAPORE_OFFSET}`)
}

/** UTC ISO bounds of a Singapore month, start inclusive and end exclusive. */
export function monthBounds(monthKey) {
  return {
    startIso: singaporeMidnight(`${monthKey}-01`).toISOString(),
    endIso: singaporeMidnight(`${shiftMonth(monthKey, 1)}-01`).toISOString(),
  }
}

/**
 * Day cells for a Monday-first month grid: `null` for each blank before the
 * 1st, then `{ dateKey, day }` for every day of the month.
 */
export function monthCells(monthKey) {
  const { year, month } = parseMonthKey(monthKey)
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const leadingBlanks = (firstWeekday + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const cells = Array.from({ length: leadingBlanks }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ dateKey: `${monthKey}-${String(day).padStart(2, '0')}`, day })
  }
  return cells
}

/** The sessions that fall in `monthKey`, grouped by Singapore day and sorted by start. */
export function groupSessionsByDay(sessions, monthKey) {
  const byDay = {}
  for (const session of sessions) {
    if (singaporeMonthKey(session.starts_at) !== monthKey) continue
    const dateKey = singaporeDateKey(session.starts_at)
    if (!byDay[dateKey]) byDay[dateKey] = []
    byDay[dateKey].push(session)
  }
  for (const daySessions of Object.values(byDay)) {
    daySessions.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  }
  return byDay
}

export function formatMonthTitle(monthKey) {
  return monthTitleFormat.format(singaporeMidnight(`${monthKey}-01`))
}

/** "Friday, 9 October" for screen readers. */
export function formatDayLabel(dateKey) {
  return dayLabelFormat.format(singaporeMidnight(dateKey))
}

/** "Fri, 9 Oct", matching how session dates read elsewhere on the page. */
export function formatDayTitle(dateKey) {
  return dayTitleFormat.format(singaporeMidnight(dateKey))
}

export function sessionCountLabel(count) {
  if (count === 0) return 'no sessions'
  return `${count} session${count === 1 ? '' : 's'}`
}
