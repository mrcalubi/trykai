import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EVENTS,
  analyticsOptions,
  cleanEvent,
  cleanUrl,
  currentAttribution,
  initAnalytics,
  resetAnalyticsForTests,
  track,
} from './analytics'

const ORIGIN = 'https://www.trykai.sg'

function fakePosthog() {
  return { init: vi.fn(), capture: vi.fn() }
}

async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

// Node's own experimental localStorage hides jsdom's; give each test a plain
// in-memory one.
function memoryStorage() {
  const items = new Map()
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  }
}

beforeEach(() => {
  resetAnalyticsForTests()
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('analyticsOptions', () => {
  it('is off without a key', () => {
    expect(analyticsOptions({})).toBeNull()
    expect(analyticsOptions({ VITE_POSTHOG_KEY: '  ' })).toBeNull()
    expect(analyticsOptions(undefined)).toBeNull()
  })

  it('runs cookieless with no replay, no autocapture and the URL cleaner', () => {
    const options = analyticsOptions({ VITE_POSTHOG_KEY: ' phc_test ' })
    expect(options.key).toBe('phc_test')
    expect(options.config).toMatchObject({
      api_host: 'https://us.i.posthog.com',
      cookieless_mode: 'always',
      autocapture: false,
      disable_session_recording: true,
      disable_surveys: true,
      capture_pageview: 'history_change',
      before_send: cleanEvent,
    })
  })

  it('takes a host override', () => {
    const options = analyticsOptions({ VITE_POSTHOG_KEY: 'k', VITE_POSTHOG_HOST: 'https://eu.i.posthog.com' })
    expect(options.config.api_host).toBe('https://eu.i.posthog.com')
  })
})

describe('cleanUrl', () => {
  it('drops the fragment and every non-utm query parameter', () => {
    expect(
      cleanUrl(`${ORIGIN}/reset-password?token=secret&utm_source=ig#access_token=abc`, ORIGIN),
    ).toBe(`${ORIGIN}/reset-password?utm_source=ig`)
  })

  it('hides join codes', () => {
    expect(cleanUrl(`${ORIGIN}/join/ABC123?x=1`, ORIGIN)).toBe(`${ORIGIN}/join/:code`)
    expect(cleanUrl('/join/ABC123', ORIGIN)).toBe('/join/:code')
  })

  it('keeps only origin and path for other sites', () => {
    expect(cleanUrl('https://l.instagram.com/?u=https%3A%2F%2Ftrykai.sg&e=xyz', ORIGIN)).toBe(
      'https://l.instagram.com/',
    )
  })

  it('leaves non-URL values alone', () => {
    expect(cleanUrl('$direct', ORIGIN)).toBe('$direct')
    expect(cleanUrl('', ORIGIN)).toBe('')
    expect(cleanUrl(null, ORIGIN)).toBeNull()
  })

  it('falls back to stripping the query when the URL will not parse', () => {
    expect(cleanUrl('http://[bad/path?x=1', ORIGIN)).toBe('http://[bad/path')
  })

  it('uses the page origin by default', () => {
    expect(cleanUrl(`${window.location.origin}/u/1?tab=bookings`)).toBe(`${window.location.origin}/u/1`)
  })
})

describe('cleanEvent', () => {
  it('cleans URL properties and leaves the rest', () => {
    const event = cleanEvent({
      event: '$pageview',
      properties: {
        $current_url: `${window.location.origin}/login#access_token=abc`,
        $pathname: '/join/CODE',
        listing_id: 'L1',
      },
    })
    expect(event.properties).toEqual({
      $current_url: `${window.location.origin}/login`,
      $pathname: '/join/:code',
      listing_id: 'L1',
    })
  })

  it('passes through an event without properties', () => {
    expect(cleanEvent(null)).toBeNull()
    expect(cleanEvent({ event: 'x' })).toEqual({ event: 'x' })
  })
})

describe('initAnalytics and track', () => {
  it('does nothing without a key, but still remembers the source', async () => {
    window.history.replaceState(null, '', '/?utm_source=instagram&utm_medium=bio')
    const loader = vi.fn()
    expect(initAnalytics({}, loader)).toBe(false)
    track(EVENTS.listingViewed, { listing_id: 'L1' })
    await flush()
    expect(loader).not.toHaveBeenCalled()
    expect(currentAttribution()).toEqual({ source: 'instagram', medium: 'bio', campaign: null })
  })

  it('loads PostHog once and sends events with the first-touch source', async () => {
    window.history.replaceState(null, '', '/?utm_source=tiktok&utm_campaign=dayone')
    const posthog = fakePosthog()
    const loader = vi.fn(async () => ({ default: posthog }))

    expect(initAnalytics({ VITE_POSTHOG_KEY: 'phc_test' }, loader)).toBe(true)
    expect(initAnalytics({ VITE_POSTHOG_KEY: 'phc_test' }, loader)).toBe(true)
    track(EVENTS.checkoutStarted, { listing_id: 'L1' })
    await flush()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(posthog.init).toHaveBeenCalledWith('phc_test', expect.objectContaining({ cookieless_mode: 'always' }))
    expect(posthog.capture).toHaveBeenCalledWith('checkout_started', {
      first_utm_source: 'tiktok',
      first_utm_campaign: 'dayone',
      listing_id: 'L1',
    })
  })

  it('accepts a module without a default export', async () => {
    const posthog = fakePosthog()
    initAnalytics({ VITE_POSTHOG_KEY: 'k' }, async () => ({ posthog }))
    track(EVENTS.imKeen)
    await flush()
    expect(posthog.capture).toHaveBeenCalledWith('im_keen', {})
  })

  it('refuses unknown event names', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const posthog = fakePosthog()
    initAnalytics({ VITE_POSTHOG_KEY: 'k' }, async () => ({ default: posthog }))
    track('listing_veiwed')
    await flush()
    expect(posthog.capture).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('never throws when PostHog fails to load or capture', async () => {
    initAnalytics({ VITE_POSTHOG_KEY: 'k' }, async () => {
      throw new Error('blocked by an ad blocker')
    })
    expect(() => track(EVENTS.bookingPaid)).not.toThrow()
    await flush()

    resetAnalyticsForTests()
    const posthog = {
      init: vi.fn(),
      capture: vi.fn(() => {
        throw new Error('boom')
      }),
    }
    initAnalytics({ VITE_POSTHOG_KEY: 'k' }, async () => ({ default: posthog }))
    expect(() => track(EVENTS.bookingPaid)).not.toThrow()
    await flush()
    expect(posthog.capture).toHaveBeenCalled()
  })
})
