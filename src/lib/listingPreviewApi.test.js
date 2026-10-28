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

function routeFetch({
  index = () => new Response(indexHtml),
  listings = () => Response.json([listing]),
  sessions = () => Response.json([]),
  rating = () => Response.json([]),
} = {}) {
  return vi.fn(async (url) => {
    const target = String(url)
    if (target.includes('/rest/v1/listings')) return listings(target)
    if (target.includes('/rest/v1/sessions')) return sessions(target)
    if (target.includes('/rest/v1/rpc/listing_ratings')) return rating(target)
    return index(target)
  })
}

const fullListing = {
  ...listing,
  description: 'Pull a shot and pour a heart.',
  category: 'Food & Drink',
  duration_mins: 120,
  max_guests: 6,
  whats_provided: ['Milk'],
  what_to_bring: [],
  host_id: '5f0c2a9e-1b2c-4d3e-8f9a-0b1c2d3e4f5a',
  users: { display_name: 'Mei', is_id_verified: true },
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
    expect(res.body).toContain('<div id="root"><main><article>')
    expect(res.body).toContain('<h1>Latte art for beginners</h1>')
    expect(res.body).toContain('src="/src/main.jsx"')

    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    const listingsUrl = urls.find((u) => u.includes('/rest/v1/listings'))
    expect(listingsUrl).toContain(`id=eq.${ID}`)
    expect(listingsUrl).toContain('is_active=eq.true')
    expect(listingsUrl).toContain('review_status=eq.approved')
    expect(listingsUrl).toContain('select=title,area,price_per_person,photo_urls,')
    expect(listingsUrl).toContain('users!host_id(display_name,is_id_verified)')
    expect(listingsUrl).not.toContain('full_address')
    const sessionsUrl = urls.find((u) => u.includes('/rest/v1/sessions'))
    expect(sessionsUrl).toContain(`listing_id=eq.${ID}`)
    expect(sessionsUrl).toContain('status=eq.open')
    expect(sessionsUrl).toContain('order=starts_at.asc')
    expect(urls[0]).toBe('https://trykai.sg/index.html')
  })

  it('serves the listing details, sessions, rating and JSON-LD for crawlers', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        listings: () => Response.json([fullListing]),
        sessions: () =>
          Response.json([{ starts_at: '2027-03-20T06:00:00Z', duration_mins: null, spots_remaining: 3 }]),
        rating: () => Response.json([{ listing_id: ID, average: 4.9, review_count: 7 }]),
      }),
    )
    const res = mockRes()
    await handler(req(), res)

    expect(res.body).toContain('<p>Pull a shot and pour a heart.</p>')
    expect(res.body).toContain('<li>Rating: 4.9 out of 5 from 7 reviews</li>')
    expect(res.body).toContain('· 3 spots left</li>')
    expect(res.body).toContain('Mei</a> (ID-verified)')
    expect(res.body).toContain('<script type="application/ld+json">')
    expect(res.body).toContain('"@type":"Event"')
  })

  it('still serves the listing when sessions and rating fail', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        listings: () => Response.json([fullListing]),
        sessions: () => Promise.reject(new Error('timeout')),
        rating: () => new Response('nope', { status: 500 }),
      }),
    )
    const res = mockRes()
    await handler(req(), res)

    expect(res.body).toContain('<h1>Latte art for beginners</h1>')
    expect(res.body).toContain('<p>No sessions are scheduled right now.</p>')
    expect(res.body).not.toContain('Rating:')
    expect(res.body).not.toContain('"@type":"Event"')
  })

  it('retries with the basic columns when the full select fails', async () => {
    const listings = vi.fn((url) =>
      url.includes('what_to_bring')
        ? Response.json({ message: 'column does not exist' }, { status: 400 })
        : Response.json([listing]),
    )
    vi.stubGlobal('fetch', routeFetch({ listings }))
    const res = mockRes()
    await handler(req(), res)

    expect(listings).toHaveBeenCalledTimes(2)
    expect(String(listings.mock.calls[1][0])).toContain('select=title,area,price_per_person,photo_urls&')
    expect(res.body).toContain('<h1>Latte art for beginners</h1>')
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
    expect(res.body).toContain('<h1>Latte art for beginners</h1>')
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
    ['Google URL inspection', 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)'],
    ['Bing', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
    ['GPTBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot'],
    ['ChatGPT search', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot'],
    ['ChatGPT browsing', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot'],
    ['ClaudeBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'],
    ['Claude browsing', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)'],
    ['PerplexityBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)'],
    ['Perplexity browsing', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)'],
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
