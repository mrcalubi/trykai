/**
 * GET /sitemap.xml (rewritten here in vercel.json).
 *
 * Reads live listings with the anon key, so RLS still applies: inactive,
 * unapproved and suspended hosts' listings are left out. If Supabase fails,
 * the static pages still go out, cached briefly so the next fetch retries.
 */

import { sitemapPaths, sitemapXml } from './_lib/sitemap.js'

// Far below the 50,000 URLs one sitemap may hold.
const MAX_LISTINGS = 5000

function siteOrigin(req) {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  return `https://${host}`
}

async function fetchLiveListings() {
  const base = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) {
    console.warn('sitemap: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set')
    return null
  }
  try {
    const response = await fetch(
      `${base}/rest/v1/listings?select=id,host_id&is_active=eq.true&review_status=eq.approved` +
        `&order=created_at.desc&limit=${MAX_LISTINGS}`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      },
    )
    if (!response.ok) {
      console.warn('sitemap: listings fetch failed', response.status)
      return null
    }
    const rows = await response.json()
    return Array.isArray(rows) ? rows : null
  } catch (error) {
    console.warn('sitemap: listings fetch failed', error?.message)
    return null
  }
}

export default async function handler(req, res) {
  const listings = await fetchLiveListings()
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader(
    'Cache-Control',
    listings
      ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
      : 'public, max-age=0, s-maxage=60',
  )
  res.status(200).send(sitemapXml(siteOrigin(req), sitemapPaths(listings ?? [])))
}
