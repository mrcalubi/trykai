import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/listing-preview.js'

const ID = '0b6c2f1e-8d1a-4f43-9a7e-2c5d8e9f1a2b'
const indexHtml = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8')
const listing = {
  title: 'Latte art for beginners',
  area: 'Bukit Merah',
  price_per_person: 2500,
  photo_urls: ['https://x.supabase.co/storage/v1/object/public/listing-photos/u/cover.jpg'],
}

function mockRes() {
  const res = { headers: {}, statusCode: null, body: null }
  res.setHeader = (key, value) => {
    res.headers[key] = value
  }
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.send = (body) => {
    res.body = body
    return res
  }
  return res
}

function req(id = ID) {
  return { query: { id }, headers: { host: 'trykai.sg' } }
}

function routeFetch({ index = () => new Response(indexHtml), listings = () => Response.json([listing]) } = {}) {
  return vi.fn(async (url) => (String(url).includes('/rest/v1/listings') ? listings(url) : index(url)))
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('api/listing-preview', () => {
  it('serves index.html with the listing preview tags', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)
    const res = mockRes()
    await handler(req(), res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8')
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=300/)
    expect(res.body).toContain('content="Latte art for beginners · TryKai"')
    expect(res.body).toContain(`content="https://trykai.sg/listings/${ID}"`)
    expect(res.body).toContain('<div id="root"></div>')

    const listingsUrl = String(fetchMock.mock.calls.find(([u]) => String(u).includes('/rest/v1/'))[0])
    expect(listingsUrl).toContain(`id=eq.${ID}`)
    expect(listingsUrl).toContain('is_active=eq.true')
    expect(listingsUrl).toContain('review_status=eq.approved')
    expect(listingsUrl).toContain('select=title,area,price_per_person,photo_urls')
    expect(listingsUrl).not.toContain('full_address')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://trykai.sg/index.html')
  })

  it('serves the default preview when the listing is hidden or missing', async () => {
    vi.stubGlobal('fetch', routeFetch({ listings: () => Response.json([]) }))
    const res = mockRes()
    await handler(req(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(indexHtml)
  })

  it('never queries Supabase for an id that is not a uuid', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)
    const res = mockRes()
    await handler(req('abc,select=*'), res)
    expect(res.body).toBe(indexHtml)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('serves the default preview when Supabase errors or throws', async () => {
    vi.stubGlobal('fetch', routeFetch({ listings: () => new Response('nope', { status: 500 }) }))
    const res = mockRes()
    await handler(req(), res)
    expect(res.body).toBe(indexHtml)

    vi.stubGlobal('fetch', routeFetch({ listings: () => Promise.reject(new Error('timeout')) }))
    const res2 = mockRes()
    await handler(req(), res2)
    expect(res2.body).toBe(indexHtml)
  })

  it('serves the default preview when the env is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubGlobal('fetch', routeFetch())
    const res = mockRes()
    await handler(req(), res)
    expect(res.body).toBe(indexHtml)
  })

  it('still unfurls when index.html cannot be loaded, without redirecting', async () => {
    vi.stubGlobal('fetch', routeFetch({ index: () => new Response('', { status: 503 }) }))
    const res = mockRes()
    await handler(req(), res)
    expect(res.statusCode).toBe(200)
    expect(res.headers.Location).toBeUndefined()
    expect(res.body).toContain('content="Latte art for beginners · TryKai"')
  })

  it('uses the forwarded host for the origin', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)
    await handler(
      { query: { id: ID }, headers: { host: 'internal', 'x-forwarded-host': 'trykai.vercel.app' } },
      mockRes(),
    )
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://trykai.vercel.app/index.html')
  })
})

describe('vercel.json', () => {
  const config = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../vercel.json'), 'utf8'))
  const [preview, catchAll] = config.rewrites
  const pattern = new RegExp(`^${preview.has[0].value}$`)

  it('routes listing pages to the preview function before the SPA catch-all', () => {
    expect(preview.source).toBe('/listings/:id')
    expect(preview.destination).toBe('/api/listing-preview?id=:id')
    expect(catchAll).toEqual({ source: '/(.*)', destination: '/index.html' })
  })

  it.each([
    ['WhatsApp', 'WhatsApp/2.23.20.0 A'],
    ['iMessage', 'Mozilla/5.0 (Macintosh) AppleWebKit/601.2.4 (KHTML, like Gecko) facebookexternalhit/1.1 Facebot Twitterbot/1.0'],
    ['Telegram', 'TelegramBot (like TwitterBot)'],
    ['Facebook', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
    ['Slack', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
    ['Discord', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'],
    ['LinkedIn', 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)'],
    ['Google', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
  ])('sends %s to the preview function', (_name, ua) => {
    expect(pattern.test(ua)).toBe(true)
  })

  it.each([
    ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
    ['Android Chrome', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'],
    ['Desktop Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'],
  ])('leaves %s on the normal app', (_name, ua) => {
    expect(pattern.test(ua)).toBe(false)
  })
})
