/**
 * sitemap.xml for search engines: the public pages, every live listing, and
 * the profile of each host with a live listing. Self-contained for the same
 * reason as linkPreview.js (Vercel runs api/ files unbundled).
 *
 * No <lastmod>: listings have no public updated-at column, and a guessed date
 * is worse than none.
 */

import { escapeHtml, isListingId } from './linkPreview.js'

export const STATIC_PATHS = [
  '/',
  '/terms',
  '/privacy',
  '/refund-policy',
  '/cancellation-policy',
  '/dispute-policy',
]

/** Static pages, then listings in the order given, then each host once. */
export function sitemapPaths(listings = []) {
  const rows = Array.isArray(listings) ? listings : []
  const listingPaths = rows.filter((row) => isListingId(row?.id)).map((row) => `/listings/${row.id}`)
  const hostPaths = [...new Set(rows.map((row) => row?.host_id).filter(isListingId))].map(
    (hostId) => `/u/${hostId}`,
  )
  return [...STATIC_PATHS, ...listingPaths, ...hostPaths]
}

export function sitemapXml(origin, paths) {
  const urls = paths.map((path) => `  <url><loc>${escapeHtml(`${origin}${path}`)}</loc></url>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}
