/**
 * First-touch marketing source (ANALYTICS_AND_AI_SEARCH.md, 26 Nov 2026).
 *
 * On the first visit that carries utm_source, or that arrives from another
 * site, we remember { source, medium, campaign } for 30 days. It rides along
 * on every analytics event and is saved on the booking by
 * create-payment-intent, so bookings can be counted per channel.
 *
 * Only the campaign tag is stored (never an ID, a URL or anything about the
 * person), in localStorage, which can be missing or throw: every access is
 * guarded and the site works the same without it.
 */
import { cleanTag } from '../../supabase/functions/_shared/attribution.ts'

export const FIRST_TOUCH_KEY = 'trykai:first-touch'
export const FIRST_TOUCH_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function safeStorage(storage) {
  if (storage !== undefined) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** { source, medium, campaign } from a query string, or null without a source. */
export function utmFromSearch(search) {
  let params
  try {
    params = new URLSearchParams(search ?? '')
  } catch {
    return null
  }
  const source = cleanTag(params.get('utm_source'))
  if (!source) return null
  return {
    source,
    medium: cleanTag(params.get('utm_medium')),
    campaign: cleanTag(params.get('utm_campaign')),
  }
}

/**
 * An untagged link from another site still says something (a host's
 * Linktree, a blog). Returns { source: <host>, medium: 'referral' }, or null
 * for no referrer or our own site.
 */
export function sourceFromReferrer(referrer, ownHost) {
  if (!referrer) return null
  let host
  try {
    host = new URL(referrer).hostname.toLowerCase()
  } catch {
    return null
  }
  const bare = (value) => String(value ?? '').toLowerCase().replace(/^www\./, '')
  if (!host || bare(host) === bare(ownHost)) return null
  const source = cleanTag(bare(host))
  return source ? { source, medium: 'referral', campaign: null } : null
}

/** The remembered source, or null when there is none or it has expired. */
export function firstTouch(storage, now = Date.now()) {
  const store = safeStorage(storage)
  if (!store) return null
  try {
    const saved = JSON.parse(store.getItem(FIRST_TOUCH_KEY) ?? 'null')
    if (!saved || typeof saved.source !== 'string' || typeof saved.at !== 'number') return null
    if (now - saved.at > FIRST_TOUCH_DAYS * DAY_MS) {
      store.removeItem(FIRST_TOUCH_KEY)
      return null
    }
    return {
      source: saved.source,
      medium: saved.medium ?? null,
      campaign: saved.campaign ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Call once per page load. Keeps the first source seen in the last 30 days;
 * a later visit never replaces it. A direct visit (no tag, no referrer) is not
 * stored, so a tagged link afterwards still counts as the first touch.
 */
export function rememberFirstTouch(
  { search, referrer, host } = {},
  storage,
  now = Date.now(),
) {
  const store = safeStorage(storage)
  const existing = firstTouch(store, now)
  if (existing) return existing
  const found = utmFromSearch(search) ?? sourceFromReferrer(referrer, host)
  if (!found) return null
  if (store) {
    try {
      store.setItem(FIRST_TOUCH_KEY, JSON.stringify({ ...found, at: now }))
    } catch {
      // Storage full or blocked: this visit still counts, the next one may not.
    }
  }
  return found
}

/** Event properties for analytics: first_utm_source etc., only those we know. */
export function firstTouchProperties(touch) {
  if (!touch?.source) return {}
  return {
    first_utm_source: touch.source,
    ...(touch.medium ? { first_utm_medium: touch.medium } : {}),
    ...(touch.campaign ? { first_utm_campaign: touch.campaign } : {}),
  }
}
