/**
 * GET /listings/:id for link unfurlers (WhatsApp, iMessage, Telegram, Slack),
 * search crawlers and AI crawlers. vercel.json rewrites only those user agents
 * here; people browsing get the static app as before.
 *
 * Returns the normal index.html with the listing's own preview tags and
 * JSON-LD, plus the listing's details as plain HTML inside #root for crawlers
 * that do not run JavaScript. The page is still the same app for anyone who
 * renders it. Any failure falls back to the unchanged index.html: a missing
 * preview must never break the link.
 *
 * Reads public listing columns with the anon key, so RLS still applies: an
 * inactive listing or a suspended host's listing gets the default preview.
 * Upcoming sessions and the rating are extras: if either read fails, the page
 * goes out without it.
 */

import {
  injectPreviewMeta,
  injectRootContent,
  isListingId,
  listingPageBody,
  listingPreviewMeta,
  listingStructuredData,
} from './_lib/linkPreview.js'

const BASE_COLUMNS = 'title,area,price_per_person,photo_urls'
const LISTING_COLUMNS =
  `${BASE_COLUMNS},description,category,duration_mins,max_guests,whats_provided,what_to_bring,` +
  'host_id,users!host_id(display_name,is_id_verified)'
const SESSION_COLUMNS = 'starts_at,duration_mins,spots_remaining'
const MAX_SESSIONS = 10

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
  <body><div id="root"></div><a href="https://trykai.sg">TryKai</a></body>
</html>
`

function siteOrigin(req) {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  return `https://${host}`
}

function supabaseConfig() {
  const base = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) {
    console.warn('listing-preview: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set')
    return null
  }
  return { base, key }
}

async function restGet({ base, key }, path, init = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(4000),
  })
  if (!response.ok) {
    console.warn('listing-preview: fetch failed', path.split('?')[0], response.status)
    return null
  }
  return response.json()
}

async function fetchListing(config, id) {
  const filters = `&id=eq.${encodeURIComponent(id)}&is_active=eq.true&review_status=eq.approved&limit=1`
  // A database without a newer column (what_to_bring, the host embed) still
  // gets the basic preview rather than none.
  const rows =
    (await restGet(config, `listings?select=${LISTING_COLUMNS}${filters}`)) ??
    (await restGet(config, `listings?select=${BASE_COLUMNS}${filters}`))
  return Array.isArray(rows) ? (rows[0] ?? null) : null
}

async function fetchSessions(config, id) {
  const now = encodeURIComponent(new Date().toISOString())
  const rows = await restGet(
    config,
    `sessions?select=${SESSION_COLUMNS}&listing_id=eq.${encodeURIComponent(id)}` +
      `&status=eq.open&starts_at=gt.${now}&order=starts_at.asc&limit=${MAX_SESSIONS}`,
  )
  return Array.isArray(rows) ? rows : []
}

async function fetchRating(config, id) {
  const rows = await restGet(config, 'rpc/listing_ratings', {
    method: 'POST',
    body: JSON.stringify({ listing_ids: [id] }),
  })
  return Array.isArray(rows) ? (rows[0] ?? null) : null
}

/** An extra read that may fail without taking the page down with it. */
function optional(promise, fallback) {
  return promise.catch((error) => {
    console.warn('listing-preview: optional read failed', error?.message)
    return fallback
  })
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
  const config = isListingId(id) ? supabaseConfig() : null
  if (config) {
    try {
      const [listing, sessions, rating] = await Promise.all([
        fetchListing(config, id),
        optional(fetchSessions(config, id), []),
        optional(fetchRating(config, id), null),
      ])
      const pageUrl = `${origin}/listings/${id}`
      const meta = listing ? listingPreviewMeta(listing, pageUrl) : null
      if (meta) {
        const page = { pageUrl, origin, sessions, rating }
        meta.structuredData = listingStructuredData(listing, page)
        body = injectRootContent(injectPreviewMeta(html, meta), listingPageBody(listing, page))
      }
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
