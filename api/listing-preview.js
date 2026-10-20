/**
 * GET /listings/:id for link unfurlers (WhatsApp, iMessage, Telegram, Slack,
 * search crawlers). vercel.json rewrites only those user agents here; people
 * browsing get the static app as before.
 *
 * Returns the normal index.html with the listing's own preview tags, so the
 * page is the same app for anyone who renders it. Any failure falls back to
 * the unchanged index.html: a missing preview must never break the link.
 *
 * Reads public listing columns with the anon key, so RLS still applies: an
 * inactive listing or a suspended host's listing gets the default preview.
 */

import { injectPreviewMeta, isListingId, listingPreviewMeta } from './_lib/linkPreview.js'

const LISTING_COLUMNS = 'title,area,price_per_person,photo_urls'

const FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- link-preview:start -->
    <meta property="og:site_name" content="TryKai" />
    <meta property="og:title" content="TryKai" />
    <!-- link-preview:end -->
    <title>TryKai</title>
  </head>
  <body><a href="https://trykai.sg">TryKai</a></body>
</html>
`

function siteOrigin(req) {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  return `https://${host}`
}

async function fetchListing(id) {
  const base = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) {
    console.warn('listing-preview: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set')
    return null
  }
  const url =
    `${base}/rest/v1/listings?select=${LISTING_COLUMNS}` +
    `&id=eq.${encodeURIComponent(id)}&is_active=eq.true&limit=1`
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(4000),
  })
  if (!response.ok) {
    console.warn('listing-preview: listings fetch failed', response.status)
    return null
  }
  const rows = await response.json()
  return Array.isArray(rows) ? (rows[0] ?? null) : null
}

export default async function handler(req, res) {
  const origin = siteOrigin(req)
  const id = String(req.query?.id ?? '')

  let html = FALLBACK_HTML
  try {
    const page = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(4000) })
    if (!page.ok) throw new Error(`index.html ${page.status}`)
    html = await page.text()
  } catch (error) {
    // Never redirect here: a crawler following the redirect would match the
    // same rewrite again. A bare page with the right tags is enough to unfurl.
    console.warn('listing-preview: could not load index.html', error?.message)
  }

  let body = html
  if (isListingId(id)) {
    try {
      const listing = await fetchListing(id)
      const meta = listing ? listingPreviewMeta(listing, `${origin}/listings/${id}`) : null
      if (meta) body = injectPreviewMeta(html, meta)
    } catch (error) {
      console.warn('listing-preview: preview failed', error?.message)
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Unfurlers fetch rarely and re-fetch on their own schedule. Five minutes at
  // the edge keeps a burst of shares from hitting Supabase each time.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600')
  res.status(200).send(body)
}
