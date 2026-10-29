import * as Sentry from '@sentry/react'

/**
 * Same-origin requests, plus the public site. Supabase and Stripe are left
 * out: those hosts do not allow the Sentry trace headers, and adding them
 * would fail the browser's CORS check.
 */
export const tracePropagationTargets = [
  /^\//,
  /^https:\/\/(?:[a-z0-9-]+\.)?trykai\.sg\//,
]

/**
 * Full rate outside production so a setup check is not sampled away.
 * Production stays at 10%, inside the range Sentry recommends for a new app.
 */
export function tracesSampleRate(mode) {
  return mode === 'production' ? 0.1 : 1
}

export function sentryOptions(env = import.meta.env) {
  const dsn = typeof env.VITE_SENTRY_DSN === 'string' ? env.VITE_SENTRY_DSN.trim() : ''
  if (!dsn) return null

  const mode = typeof env.MODE === 'string' && env.MODE ? env.MODE : 'production'
  const environmentOverride = typeof env.VITE_SENTRY_ENVIRONMENT === 'string'
    ? env.VITE_SENTRY_ENVIRONMENT.trim()
    : ''
  const release = typeof env.VITE_SENTRY_RELEASE === 'string' ? env.VITE_SENTRY_RELEASE.trim() : ''

  return {
    dsn,
    environment: environmentOverride || mode,
    ...(release ? { release } : {}),
    tracesSampleRate: tracesSampleRate(mode),
    tracePropagationTargets,
  }
}

export function initSentry(env = import.meta.env, routerHooks) {
  const options = sentryOptions(env)
  if (!options) return false

  Sentry.init({
    ...options,
    integrations: [
      Sentry.reactRouterBrowserTracingIntegration(routerHooks),
    ],
  })
  return true
}
