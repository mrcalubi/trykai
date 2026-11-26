/**
 * Product analytics (PostHog), cookieless (ANALYTICS_AND_AI_SEARCH.md).
 *
 * - Off unless VITE_POSTHOG_KEY is set, so tests and local work send nothing.
 * - cookieless_mode 'always': no cookies, no local or session storage from
 *   PostHog, and no consent banner. Visitors are counted by a daily hash made
 *   on PostHog's servers. The PostHog project must have "Enable cookieless
 *   tracking" turned on (Settings > Project > Web analytics) or every event is
 *   dropped.
 * - PostHog does not offer session replay in cookieless mode, so it is off.
 * - No autocapture: only page views and the named events below, so text a
 *   person typed or a name on screen is never sent.
 * - URLs are cleaned before sending: no #fragment (Supabase puts auth tokens
 *   there), no query string except utm_*, and no /join/ invite code.
 * - posthog-js is loaded after first paint, so it costs nothing up front.
 *
 * `track()` never throws and never waits; call it and move on.
 */
import { firstTouchProperties, rememberFirstTouch } from './attribution'

/** The ~10 events we send. Anything else is a typo. */
export const EVENTS = Object.freeze({
  listingViewed: 'listing_viewed',
  checkoutStarted: 'checkout_started',
  paymentMethodChosen: 'payment_method_chosen',
  bookingPaid: 'booking_paid',
  signupCompleted: 'signup_completed',
  imKeen: 'im_keen',
  inviteFriendShared: 'invite_friend_shared',
  listingStarted: 'listing_started',
  listingSubmitted: 'listing_submitted',
  hostVerified: 'host_verified',
})

const KNOWN_EVENTS = new Set(Object.values(EVENTS))
const URL_PROPERTIES = ['$current_url', '$referrer', '$initial_current_url', '$prev_pageview_pathname', '$pathname']

let client = null // Promise<PostHog> once started
let touch = null

export function analyticsOptions(env = import.meta.env) {
  const key = typeof env?.VITE_POSTHOG_KEY === 'string' ? env.VITE_POSTHOG_KEY.trim() : ''
  if (!key) return null
  const host = typeof env.VITE_POSTHOG_HOST === 'string' && env.VITE_POSTHOG_HOST.trim()
    ? env.VITE_POSTHOG_HOST.trim()
    : 'https://us.i.posthog.com'
  return {
    key,
    config: {
      api_host: host,
      defaults: '2026-08-30',
      cookieless_mode: 'always',
      person_profiles: 'never',
      autocapture: false,
      capture_pageview: 'history_change',
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      advanced_disable_flags: true,
      before_send: cleanEvent,
    },
  }
}

/**
 * Keeps only utm_* query parameters, drops the #fragment and hides /join/
 * codes. Leaves other sites' URLs (a referrer) at their origin and path.
 */
export function cleanUrl(value, origin = globalThis.location?.origin) {
  if (typeof value !== 'string' || !value) return value
  // Not a URL at all, e.g. PostHog's '$direct' referrer.
  if (!/^https?:\/\//i.test(value) && !value.startsWith('/')) return value
  let url
  try {
    url = new URL(value, origin || 'https://trykai.sg')
  } catch {
    return value.split(/[?#]/)[0]
  }
  const ours = !origin || url.origin === origin
  const kept = new URLSearchParams()
  if (ours) {
    for (const [name, paramValue] of url.searchParams) {
      if (name.startsWith('utm_')) kept.append(name, paramValue)
    }
  }
  const path = url.pathname.replace(/^\/join\/[^/]+/, '/join/:code')
  const query = kept.toString()
  const isPathOnly = value.startsWith('/')
  return `${isPathOnly ? '' : url.origin}${path}${query ? `?${query}` : ''}`
}

/** PostHog before_send hook: clean every URL-shaped property. */
export function cleanEvent(event) {
  if (!event?.properties) return event
  const properties = { ...event.properties }
  for (const name of URL_PROPERTIES) {
    if (name in properties) properties[name] = cleanUrl(properties[name])
  }
  return { ...event, properties }
}

/**
 * Starts PostHog in the background and remembers the first-touch source.
 * Returns false when analytics is off. Safe to call more than once.
 */
export function initAnalytics(env = import.meta.env, loader = () => import('posthog-js')) {
  if (typeof window !== 'undefined') {
    touch = rememberFirstTouch({
      search: window.location?.search,
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      host: window.location?.hostname,
    })
  }
  const options = analyticsOptions(env)
  if (!options) return false
  if (client) return true
  client = Promise.resolve()
    .then(loader)
    .then((mod) => {
      const posthog = mod.default ?? mod.posthog ?? mod
      posthog.init(options.key, options.config)
      return posthog
    })
    .catch(() => null)
  return true
}

/** The first-touch source for this visit, to send with create-payment-intent. */
export function currentAttribution() {
  return touch
}

/** Sends one named event. Never throws, never blocks. */
export function track(event, properties = {}) {
  if (!KNOWN_EVENTS.has(event)) {
    if (import.meta.env?.DEV) console.warn(`analytics: unknown event "${event}"`)
    return
  }
  if (!client) return
  const payload = { ...firstTouchProperties(touch), ...properties }
  client
    .then((posthog) => posthog?.capture(event, payload))
    .catch(() => {})
}

/** Test hook: forget the started client. */
export function resetAnalyticsForTests() {
  client = null
  touch = null
}
