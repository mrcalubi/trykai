import { isSelectableDateKey } from './sessionBatch'

/**
 * Add sessions keeps its half-filled form for this browser tab, so a host who
 * leaves to change spots ("change in listing settings") comes back to it.
 * sessionStorage only: per tab, never shared, gone when the tab closes.
 * Every read and write is wrapped because storage can throw (private mode,
 * blocked site data).
 */
const DRAFT_PREFIX = 'trykai:add-sessions:'
const OPEN_KEY = 'trykai:add-sessions:open'
const MAX_AGE_MS = 12 * 60 * 60 * 1000

function storage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

function draftKey(listingId) {
  return `${DRAFT_PREFIX}${listingId}`
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function positiveInt(value, fallback) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 ? n : fallback
}

/** True when the form holds nothing worth keeping. */
export function isEmptySessionDraft(draft) {
  if (!draft) return true
  const hasTimes =
    draft.times.some(Boolean) ||
    Object.values(draft.timesByDate).some((list) => list.some(Boolean))
  return draft.selectedDateKeys.length === 0 && !hasTimes && !draft.durationMins
}

/** Drops past or out-of-window dates and anything malformed. */
export function cleanSessionDraft(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.savedAt !== 'number' || now - raw.savedAt > MAX_AGE_MS) return null

  const selectedDateKeys = stringList(raw.selectedDateKeys)
    .filter((key) => isSelectableDateKey(key, now))
    .sort()
  const timesByDate = {}
  const rawByDate = raw.timesByDate && typeof raw.timesByDate === 'object' ? raw.timesByDate : {}
  for (const key of selectedDateKeys) {
    const list = stringList(rawByDate[key])
    if (list.length) timesByDate[key] = list
  }
  const times = stringList(raw.times)

  const draft = {
    selectedDateKeys,
    weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.filter(Number.isInteger) : [],
    everyWeeks: positiveInt(raw.everyWeeks, 1),
    forWeeks: positiveInt(raw.forWeeks, 2),
    times: times.length ? times : [''],
    timesByDate,
    perDateTimes: raw.perDateTimes === true,
    durationMins: typeof raw.durationMins === 'string' ? raw.durationMins : '',
    alsoListingIds: stringList(raw.alsoListingIds),
  }
  return isEmptySessionDraft(draft) ? null : draft
}

export function readSessionDraft(listingId, now = Date.now()) {
  const store = storage()
  if (!store || !listingId) return null
  try {
    const value = store.getItem(draftKey(listingId))
    return value ? cleanSessionDraft(JSON.parse(value), now) : null
  } catch {
    return null
  }
}

export function writeSessionDraft(listingId, draft, now = Date.now()) {
  const store = storage()
  if (!store || !listingId) return
  try {
    if (isEmptySessionDraft(draft)) {
      store.removeItem(draftKey(listingId))
      return
    }
    store.setItem(draftKey(listingId), JSON.stringify({ ...draft, savedAt: now }))
  } catch {
    // Storage full or blocked: the form still works, it just won't survive leaving.
  }
}

export function clearSessionDraft(listingId) {
  const store = storage()
  if (!store || !listingId) return
  try {
    store.removeItem(draftKey(listingId))
  } catch {
    // ignore
  }
}

/** Which listing's Add sessions form was open, so Hosting can reopen it. */
export function readOpenSessionForm() {
  const store = storage()
  if (!store) return null
  try {
    return store.getItem(OPEN_KEY) || null
  } catch {
    return null
  }
}

export function writeOpenSessionForm(listingId) {
  const store = storage()
  if (!store) return
  try {
    if (listingId) store.setItem(OPEN_KEY, String(listingId))
    else store.removeItem(OPEN_KEY)
  } catch {
    // ignore
  }
}
