import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * vercel.json lists the app's routes instead of a catch-all, so unknown URLs
 * get a real 404. These tests keep that list in step with App.jsx: a route
 * missing from vercel.json would still render (404.html is the app) but with
 * a 404 status that drops it from search.
 */

const root = resolve(import.meta.dirname, '../..')
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'))
const appSource = readFileSync(resolve(root, 'src/App.jsx'), 'utf8')
const robots = readFileSync(resolve(root, 'public/robots.txt'), 'utf8')

const appPaths = [...appSource.matchAll(/path="([^"]+)"/g)].map(([, path]) => path).filter((path) => path !== '*')
const UUID = '0b6c2f1e-8d1a-4f43-9a7e-2c5d8e9f1a2b'

/** Vercel route source (path-to-regexp style) as an anchored RegExp. */
function sourcePattern(source) {
  return new RegExp(`^${source.replace(/\./g, '\\.').replace(/:[A-Za-z]+/g, '[^/]+')}$`)
}

/** Where Vercel sends a path: a rewrite destination, a static file, or 404. */
function destinationFor(path) {
  if (path === '/') return '/index.html'
  const rule = vercel.rewrites.find((rewrite) => !rewrite.has && sourcePattern(rewrite.source).test(path))
  return rule ? rule.destination : '404'
}

describe('vercel.json app routes', () => {
  it('finds the routes in App.jsx', () => {
    expect(appPaths).toContain('/listings/:id')
    expect(appPaths.length).toBeGreaterThan(20)
  })

  it('serves the app for every route in App.jsx', () => {
    for (const path of appPaths) {
      const concrete = path.replace(/:[A-Za-z]+/g, UUID)
      expect(destinationFor(concrete), path).toBe('/index.html')
    }
  })

  it('has no catch-all, so unknown URLs are a real 404', () => {
    expect(vercel.rewrites.some((rewrite) => rewrite.source === '/(.*)')).toBe(false)
    for (const path of ['/does-not-exist', '/listings', '/listings/a/b', '/u', '/admin', '/admin/other', '/terms/x']) {
      expect(destinationFor(path), path).toBe('404')
    }
  })

  it('serves the sitemap from its function', () => {
    expect(destinationFor('/sitemap.xml')).toBe('/api/sitemap')
  })
})

describe('noindex outside production', () => {
  const rule = vercel.headers.find((header) =>
    header.headers.some(({ key, value }) => key === 'X-Robots-Tag' && value === 'noindex'),
  )
  const production = new RegExp(`^${rule.missing[0].value}$`)

  it('applies to every path on any host but trykai.sg', () => {
    expect(rule.source).toBe('/(.*)')
    expect(rule.missing[0].type).toBe('host')
    expect(production.test('trykai.sg')).toBe(true)
    expect(production.test('www.trykai.sg')).toBe(true)
    expect(production.test('trykai.vercel.app')).toBe(false)
    expect(production.test('trykai-git-staging-team.vercel.app')).toBe(false)
    expect(production.test('trykaixsg')).toBe(false)
  })
})

describe('robots.txt', () => {
  const disallowed = [...robots.matchAll(/^Disallow: (\S+)$/gm)].map(([, path]) => path)
  const blocked = (path) => disallowed.some((prefix) => path.startsWith(prefix))

  it('points crawlers at the production sitemap on www, with no redirect', () => {
    // trykai.sg answers with a 308 to www.trykai.sg.
    expect(robots).toMatch(/^Sitemap: https:\/\/www\.trykai\.sg\/sitemap\.xml$/m)
    expect(robots).toMatch(/^User-agent: \*$/m)
  })

  it('leaves every public page crawlable', () => {
    for (const path of ['/', `/listings/${UUID}`, `/u/${UUID}`, '/terms', '/privacy', '/refund-policy', '/cancellation-policy', '/dispute-policy']) {
      expect(blocked(path), path).toBe(false)
    }
  })

  it('keeps out account, booking and admin pages', () => {
    for (const path of ['/login', '/settings', '/bookings', `/bookings/${UUID}`, '/hosting', '/dashboard', `/edit-listing/${UUID}`, '/create-listing', '/verify-identity/singpass', '/admin/listings']) {
      expect(blocked(path), path).toBe(true)
    }
  })
})
