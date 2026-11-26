import { describe, expect, it } from 'vitest'
import {
  FIRST_TOUCH_DAYS,
  FIRST_TOUCH_KEY,
  firstTouch,
  firstTouchProperties,
  rememberFirstTouch,
  sourceFromReferrer,
  utmFromSearch,
} from './attribution'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value)
    },
    removeItem: (key) => {
      delete data[key]
    },
  }
}

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 26)

describe('utmFromSearch', () => {
  it('reads and cleans the three tags', () => {
    expect(utmFromSearch('?utm_source=Instagram&utm_medium=story&utm_campaign=DayOne&x=1')).toEqual({
      source: 'instagram',
      medium: 'story',
      campaign: 'dayone',
    })
  })

  it('needs a source', () => {
    expect(utmFromSearch('?utm_medium=bio')).toBeNull()
    expect(utmFromSearch('')).toBeNull()
    expect(utmFromSearch(undefined)).toBeNull()
  })

  it('fills missing medium and campaign with null', () => {
    expect(utmFromSearch('?utm_source=tiktok')).toEqual({ source: 'tiktok', medium: null, campaign: null })
  })
})

describe('sourceFromReferrer', () => {
  it('uses another site as a referral source', () => {
    expect(sourceFromReferrer('https://www.linktr.ee/somehost?x=1', 'trykai.sg')).toEqual({
      source: 'linktr.ee',
      medium: 'referral',
      campaign: null,
    })
  })

  it('ignores our own site, with or without www', () => {
    expect(sourceFromReferrer('https://www.trykai.sg/browse', 'trykai.sg')).toBeNull()
    expect(sourceFromReferrer('https://trykai.sg/', 'www.trykai.sg')).toBeNull()
  })

  it('ignores an empty or broken referrer', () => {
    expect(sourceFromReferrer('', 'trykai.sg')).toBeNull()
    expect(sourceFromReferrer('not a url', 'trykai.sg')).toBeNull()
  })
})

describe('rememberFirstTouch', () => {
  it('stores the first tagged visit', () => {
    const store = memoryStorage()
    const touch = rememberFirstTouch({ search: '?utm_source=instagram&utm_medium=bio' }, store, NOW)
    expect(touch).toEqual({ source: 'instagram', medium: 'bio', campaign: null })
    expect(JSON.parse(store.data[FIRST_TOUCH_KEY])).toMatchObject({ source: 'instagram', at: NOW })
  })

  it('never replaces an earlier source', () => {
    const store = memoryStorage()
    rememberFirstTouch({ search: '?utm_source=instagram' }, store, NOW)
    const later = rememberFirstTouch({ search: '?utm_source=tiktok' }, store, NOW + DAY)
    expect(later.source).toBe('instagram')
  })

  it('does not store a direct visit, so a later tagged link still counts', () => {
    const store = memoryStorage()
    expect(rememberFirstTouch({ search: '', referrer: '', host: 'trykai.sg' }, store, NOW)).toBeNull()
    expect(store.data[FIRST_TOUCH_KEY]).toBeUndefined()
    expect(rememberFirstTouch({ search: '?utm_source=telegram' }, store, NOW).source).toBe('telegram')
  })

  it('falls back to the referrer when untagged', () => {
    const store = memoryStorage()
    const touch = rememberFirstTouch(
      { search: '', referrer: 'https://l.instagram.com/', host: 'www.trykai.sg' },
      store,
      NOW,
    )
    expect(touch).toEqual({ source: 'l.instagram.com', medium: 'referral', campaign: null })
  })

  it('still returns the source when storage is missing or throws', () => {
    expect(rememberFirstTouch({ search: '?utm_source=craftfest' }, null, NOW).source).toBe('craftfest')
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    expect(rememberFirstTouch({ search: '?utm_source=craftfest' }, broken, NOW).source).toBe('craftfest')
  })

  it('uses window.localStorage by default', () => {
    const store = memoryStorage()
    Object.defineProperty(window, 'localStorage', { value: store, configurable: true })
    rememberFirstTouch({ search: '?utm_source=friends' }, undefined, NOW)
    expect(firstTouch(undefined, NOW).source).toBe('friends')
    expect(store.data[FIRST_TOUCH_KEY]).toBeDefined()
  })

  it('treats a localStorage that throws on access as missing', () => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError')
      },
      configurable: true,
    })
    expect(rememberFirstTouch({ search: '?utm_source=friends' }, undefined, NOW).source).toBe('friends')
    expect(firstTouch(undefined, NOW)).toBeNull()
  })
})

describe('firstTouch', () => {
  it('expires after 30 days and clears the entry', () => {
    const store = memoryStorage()
    rememberFirstTouch({ search: '?utm_source=instagram' }, store, NOW)
    expect(firstTouch(store, NOW + FIRST_TOUCH_DAYS * DAY)).not.toBeNull()
    expect(firstTouch(store, NOW + FIRST_TOUCH_DAYS * DAY + 1)).toBeNull()
    expect(store.data[FIRST_TOUCH_KEY]).toBeUndefined()
  })

  it('ignores junk in storage', () => {
    expect(firstTouch(memoryStorage({ [FIRST_TOUCH_KEY]: '{not json' }), NOW)).toBeNull()
    expect(firstTouch(memoryStorage({ [FIRST_TOUCH_KEY]: '{"source":1,"at":2}' }), NOW)).toBeNull()
    expect(firstTouch(null, NOW)).toBeNull()
  })

  it('defaults missing medium and campaign to null', () => {
    const store = memoryStorage({ [FIRST_TOUCH_KEY]: JSON.stringify({ source: 'x', at: NOW }) })
    expect(firstTouch(store, NOW)).toEqual({ source: 'x', medium: null, campaign: null })
  })
})

describe('firstTouchProperties', () => {
  it('prefixes known tags with first_', () => {
    expect(firstTouchProperties({ source: 'instagram', medium: 'story', campaign: 'dayone' })).toEqual({
      first_utm_source: 'instagram',
      first_utm_medium: 'story',
      first_utm_campaign: 'dayone',
    })
    expect(firstTouchProperties({ source: 'tiktok', medium: null, campaign: null })).toEqual({
      first_utm_source: 'tiktok',
    })
  })

  it('is empty without a source', () => {
    expect(firstTouchProperties(null)).toEqual({})
  })
})
