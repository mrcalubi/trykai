import { describe, expect, it } from 'vitest'
import { shouldPropagateTraceForUrl } from '@sentry/core'
import { sentryOptions, tracePropagationTargets, tracesSampleRate } from './sentry'

describe('tracesSampleRate', () => {
  it('keeps every trace outside production and samples production at 10%', () => {
    expect(tracesSampleRate('development')).toBe(1)
    expect(tracesSampleRate('test')).toBe(1)
    expect(tracesSampleRate('production')).toBe(0.1)
  })
})

describe('sentryOptions', () => {
  it('stays off when no DSN is configured', () => {
    expect(sentryOptions({ MODE: 'production' })).toBeNull()
    expect(sentryOptions({ MODE: 'production', VITE_SENTRY_DSN: '   ' })).toBeNull()
  })

  it('uses the DSN, the Vite mode, and a full trace rate in development', () => {
    expect(sentryOptions({
      MODE: 'development',
      VITE_SENTRY_DSN: ' https://example@o0.ingest.sentry.io/1 ',
    })).toEqual({
      dsn: 'https://example@o0.ingest.sentry.io/1',
      environment: 'development',
      tracesSampleRate: 1,
      tracePropagationTargets,
    })
  })

  it('lets a deploy override the environment and release', () => {
    expect(sentryOptions({
      MODE: 'production',
      VITE_SENTRY_DSN: 'https://example@o0.ingest.sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
      VITE_SENTRY_RELEASE: 'abc123',
    })).toMatchObject({
      environment: 'staging',
      release: 'abc123',
      tracesSampleRate: 0.1,
    })
  })
})

describe('tracePropagationTargets', () => {
  const propagate = (url) => shouldPropagateTraceForUrl(url, tracePropagationTargets)

  it('follows requests to this app and not to Supabase or Stripe', () => {
    expect(propagate('/api/sitemap')).toBe(true)
    expect(propagate('https://www.trykai.sg/listings/1')).toBe(true)
    expect(propagate('https://trykai.sg/')).toBe(true)
    expect(propagate('https://abcdefgh.supabase.co/rest/v1/listings')).toBe(false)
    expect(propagate('https://api.stripe.com/v1/payment_intents')).toBe(false)
  })
})
