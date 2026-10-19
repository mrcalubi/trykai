/**
 * Link previews for shared listing URLs.
 *
 * WhatsApp, iMessage, Telegram and other link unfurlers do not run JavaScript,
 * so they only ever see the static index.html. `api/listing-preview.js`
 * (reached through a user-agent rewrite in vercel.json) loads one listing's
 * public columns and uses these helpers to swap the default tags in that same
 * index.html for the listing's own. People browsing never hit that path.
 *
 * Only public listing columns are used. The price is the card all-in price for
 * one guest, the same figure browse and listing detail show.
 *
 * This file is deliberately self-contained. Vercel runs api/ files in plain
 * Node without bundling, so it cannot import the app's extensionless modules
 * or supabase/functions/_shared/booking.ts. The price formula below is a copy
 * of calculateGuestCharge for one guest on card; src/lib/linkPreview.test.js
 * fails if it ever disagrees with formatGuestFacingPrice.
 */

// Mirrors CARD_FEE_RATE and CARD_FEE_FLOOR_CENTS in _shared/booking.ts.
const CARD_FEE_RATE = 0.12
const CARD_FEE_FLOOR_CENTS = 250

/** Card all-in price for one guest, in cents. Always whole dollars. */
export function cardPriceForOneGuestCents(pricePerPersonCents) {
  const fee = Math.max(Math.round(pricePerPersonCents * CARD_FEE_RATE), CARD_FEE_FLOOR_CENTS)
  return Math.ceil((pricePerPersonCents + fee) / 100) * 100
}

function formatDollars(cents) {
  return `$${new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 }).format(cents / 100)}`
}

export const SITE_NAME = 'TryKai'

const LISTING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isListingId(value) {
  return typeof value === 'string' && LISTING_ID_PATTERN.test(value)
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "S$28 per person · Tiong Bahru". Area is left off when the listing has none. */
export function listingPreviewDescription(listing) {
  const price = formatDollars(cardPriceForOneGuestCents(listing.price_per_person))
  const parts = [`S${price} per person`]
  if (listing.area) parts.push(listing.area)
  return parts.join(' · ')
}

function firstHttpsPhoto(photoUrls) {
  if (!Array.isArray(photoUrls)) return null
  const cover = photoUrls[0]
  return typeof cover === 'string' && cover.startsWith('https://') ? cover : null
}

/**
 * Tags for one listing. Returns null when the row cannot make a preview, so
 * the caller serves the default homepage tags instead.
 */
export function listingPreviewMeta(listing, pageUrl) {
  const price = listing?.price_per_person
  if (!listing?.title || !Number.isInteger(price) || price <= 0) return null
  const image = firstHttpsPhoto(listing.photo_urls)
  return {
    title: `${listing.title} · ${SITE_NAME}`,
    description: listingPreviewDescription(listing),
    url: pageUrl,
    image,
    card: image ? 'summary_large_image' : 'summary',
  }
}

const PREVIEW_START = '<!-- link-preview:start -->'
const PREVIEW_END = '<!-- link-preview:end -->'

export function previewTags(meta) {
  const tags = [
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
  ]
  if (meta.url) tags.push(`<meta property="og:url" content="${escapeHtml(meta.url)}" />`)
  if (meta.image) tags.push(`<meta property="og:image" content="${escapeHtml(meta.image)}" />`)
  tags.push(
    `<meta name="twitter:card" content="${meta.card}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  )
  if (meta.image) tags.push(`<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`)
  return tags.join('\n    ')
}

/**
 * Replace the block between the link-preview markers in index.html, and the
 * <title>. If the markers are missing (someone edited index.html), the HTML is
 * returned unchanged rather than half-edited.
 */
export function injectPreviewMeta(html, meta) {
  const start = html.indexOf(PREVIEW_START)
  const end = html.indexOf(PREVIEW_END)
  if (start === -1 || end === -1 || end < start) return html
  const before = html.slice(0, start + PREVIEW_START.length)
  const after = html.slice(end)
  const withTags = `${before}\n    ${previewTags(meta)}\n    ${after}`
  return withTags.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
}
