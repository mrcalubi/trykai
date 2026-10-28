import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STATIC_PATHS, sitemapPaths, sitemapXml } from '../../api/_lib/sitemap.js'
import handler from '../../api/sitemap.js'

const LISTING_A = '0b6c2f1e-8d1a-4f43-9a7e-2c5d8e9f1a2b'
const LISTING_B = '1c7d3f2a-9e2b-4a54-8b8f-3d6e9fa02b3c'
const HOST = '5f0c2a9e-1b2c-4d3e-8f9a-0b1c2d3e4f5a'

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

const req = { headers: { host: 'trykai.sg' } }

describe('sitemapPaths', () => {
  it('lists public pages, each listing, then each host once', () => {
    expect(
      sitemapPaths([
        { id: LISTING_A, host_id: HOST },
        { id: LISTING_B, host_id: HOST },
      ]),
    ).toEqual([...STATIC_PATHS, `/listings/${LISTING_A}`, `/listings/${LISTING_B}`, `/u/${HOST}`])
  })

  it('skips rows without a valid id', () => {
    expect(sitemapPaths([{ id: 'x', host_id: null }, null])).toEqual(STATIC_PATHS)
    expect(sitemapPaths(null)).toEqual(STATIC_PATHS)
  })
})

describe('sitemapXml', () => {
  it('writes absolute, escaped URLs', () => {
    const xml = sitemapXml('https://trykai.sg', ['/', '/a&b'])
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/)
    expect(xml).toContain('<url><loc>https://trykai.sg/</loc></url>')
    expect(xml).toContain('<url><loc>https://trykai.sg/a&amp;b</loc></url>')
    expect(xml.trim().endsWith('</urlset>')).toBe(true)
  })
})

describe('api/sitemap', () => {
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

  it('lists live listings and their hosts, cached for an hour', async () => {
    const fetchMock = vi.fn(async () => Response.json([{ id: LISTING_A, host_id: HOST }]))
    vi.stubGlobal('fetch', fetchMock)
    const res = mockRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('application/xml; charset=utf-8')
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=3600/)
    expect(res.body).toContain(`<loc>https://trykai.sg/listings/${LISTING_A}</loc>`)
    expect(res.body).toContain(`<loc>https://trykai.sg/u/${HOST}</loc>`)

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('select=id,host_id')
    expect(url).toContain('is_active=eq.true')
    expect(url).toContain('review_status=eq.approved')
  })

  it('uses the forwarded host', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])))
    const res = mockRes()
    await handler({ headers: { host: 'internal', 'x-forwarded-host': 'trykai.vercel.app' } }, res)
    expect(res.body).toContain('<loc>https://trykai.vercel.app/</loc>')
  })

  it.each([
    ['errors', () => new Response('nope', { status: 500 })],
    ['throws', () => Promise.reject(new Error('timeout'))],
  ])('still serves the static pages, briefly cached, when Supabase %s', async (_name, reply) => {
    vi.stubGlobal('fetch', vi.fn(reply))
    const res = mockRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=60$/)
    expect(res.body).toContain('<loc>https://trykai.sg/terms</loc>')
    expect(res.body).not.toContain('/listings/')
  })

  it('still serves the static pages when the env is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = mockRes()
    await handler(req, res)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.body).toContain('<loc>https://trykai.sg/privacy</loc>')
  })
})
