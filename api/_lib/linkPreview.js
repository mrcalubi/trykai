/**
 * Link previews and crawler pages for shared listing URLs.
 *
 * WhatsApp, iMessage, Telegram and other link unfurlers do not run JavaScript,
 * so they only ever see the static index.html. Neither do most AI crawlers
 * (GPTBot, ClaudeBot, PerplexityBot). `api/listing-preview.js` (reached
 * through a user-agent rewrite in vercel.json) loads one listing's public
 * columns and uses these helpers to swap the default tags in that same
 * index.html for the listing's own, add schema.org JSON-LD, and put the
 * listing's details as plain HTML inside #root. The app replaces that HTML
 * when it mounts, so a crawler that runs JavaScript (Googlebot) ends up with
 * the normal page. People browsing never hit that path.
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

const TIME_ZONE = 'Asia/Singapore'

/** Copy of formatDuration in src/lib/duration.js: 390 is "6 hr 30 min". */
export function formatDuration(mins) {
  const total = Number(mins)
  if (!Number.isFinite(total) || total < 1) return ''
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  const parts = []
  if (hours) parts.push(`${hours} hr`)
  if (minutes) parts.push(`${minutes} min`)
  return parts.join(' ')
}

/** Copy of spotsLabel in src/lib/listingSpots.js. */
export function spotsLabel(n) {
  const left = Number(n)
  if (!Number.isFinite(left) || left <= 0) return 'Full'
  if (left === 1) return '1 spot left'
  if (left <= 4) return `${left} spots left`
  return `${left} spots`
}

/** "Sat, 20 Mar 2027, 2:00 pm" in Singapore time. Always with the year: crawlers keep pages for months. */
export function formatSessionDateTime(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(date)
}

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
    searchDescription: listingSearchDescription(listing),
    url: pageUrl,
    image,
    card: image ? 'summary_large_image' : 'summary',
  }
}

/** First `max` characters of free text on one line, cut at a word. */
export function textExcerpt(text, max = 160) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–—-]+$/, '')}…`
}

/** Search snippet: price and area, then the start of the listing's own description. */
export function listingSearchDescription(listing) {
  const excerpt = textExcerpt(listing?.description)
  const short = listingPreviewDescription(listing)
  return excerpt ? `${short}. ${excerpt}` : short
}

function textItems(items) {
  if (!Array.isArray(items)) return []
  return items.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
}

function paragraphsHtml(text) {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
}

function listHtml(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
}

function hostName(listing) {
  const name = listing?.users?.display_name
  return typeof name === 'string' ? name.trim() : ''
}

/** Average to one decimal, or null when the listing has no reviews yet. */
function ratingSummary(rating) {
  const count = Number(rating?.review_count)
  const average = Number(rating?.average)
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(average)) return null
  return { average: Math.round(average * 10) / 10, count }
}

function sessionEnd(session, listing) {
  const mins = Number(session.duration_mins ?? listing.duration_mins)
  const start = new Date(session.starts_at)
  if (!Number.isFinite(mins) || mins < 1 || Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() + mins * 60000).toISOString()
}

/**
 * The listing as plain HTML for crawlers that do not run JavaScript: the same
 * facts the listing page shows, in reading order. Goes inside #root.
 */
export function listingPageBody(listing, { pageUrl, origin, sessions = [], rating = null }) {
  const price = `S${formatDollars(cardPriceForOneGuestCents(listing.price_per_person))}`
  const duration = formatDuration(listing.duration_mins)
  const host = hostName(listing)
  const reviews = ratingSummary(rating)
  const image = firstHttpsPhoto(listing.photo_urls)
  const where = [listing.category, listing.area ? `${listing.area}, Singapore` : 'Singapore']
    .filter(Boolean)
    .join(' · ')

  const facts = [`<li>Price: ${escapeHtml(price)} per person, all in</li>`]
  if (duration) facts.push(`<li>Duration: ${escapeHtml(duration)}</li>`)
  if (Number.isInteger(listing.max_guests) && listing.max_guests > 0) {
    facts.push(`<li>Group size: up to ${listing.max_guests} guests</li>`)
  }
  if (reviews) {
    const noun = reviews.count === 1 ? 'review' : 'reviews'
    facts.push(`<li>Rating: ${reviews.average} out of 5 from ${reviews.count} ${noun}</li>`)
  }
  if (host) {
    const verified = listing.users?.is_id_verified === true ? ' (ID-verified)' : ''
    const hostLink = listing.host_id
      ? `<a href="${escapeHtml(`${origin}/u/${listing.host_id}`)}">${escapeHtml(host)}</a>`
      : escapeHtml(host)
    facts.push(`<li>Host: ${hostLink}${verified}</li>`)
  }
  facts.push('<li>The exact address is shared once your booking is confirmed.</li>')

  const parts = [
    `<p><a href="${escapeHtml(`${origin}/`)}">${SITE_NAME}</a>: small, hands-on sessions taught by ID-verified hosts in Singapore.</p>`,
    `<h1>${escapeHtml(listing.title)}</h1>`,
    `<p>${escapeHtml(where)}</p>`,
  ]
  if (image) parts.push(`<img src="${escapeHtml(image)}" alt="${escapeHtml(listing.title)}" />`)
  parts.push(`<ul>${facts.join('')}</ul>`)

  const about = paragraphsHtml(listing.description)
  if (about.length) parts.push('<h2>About this session</h2>', ...about)
  const provided = textItems(listing.whats_provided)
  if (provided.length) parts.push("<h2>What's provided</h2>", listHtml(provided))
  const bring = textItems(listing.what_to_bring)
  if (bring.length) parts.push('<h2>What to bring</h2>', listHtml(bring))

  parts.push('<h2>Upcoming sessions</h2>')
  const dated = sessions.filter((session) => formatSessionDateTime(session.starts_at))
  if (dated.length) {
    const items = dated.map((session) => {
      const when = escapeHtml(formatSessionDateTime(session.starts_at))
      const spots = escapeHtml(spotsLabel(session.spots_remaining))
      return `<li><time datetime="${escapeHtml(session.starts_at)}">${when}</time> · ${spots}</li>`
    })
    parts.push(`<ul>${items.join('')}</ul>`)
  } else {
    parts.push('<p>No sessions are scheduled right now.</p>')
  }
  parts.push(`<p><a href="${escapeHtml(pageUrl)}">Book ${escapeHtml(listing.title)} on ${SITE_NAME}</a></p>`)

  return `<main><article>${parts.join('')}</article></main>`
}

/**
 * schema.org JSON-LD: the listing as a Service, and each upcoming session as
 * an Event with its own price and availability. Only public facts: the place
 * is the area, never the address.
 */
export function listingStructuredData(listing, { pageUrl, origin, sessions = [], rating = null }) {
  const price = (cardPriceForOneGuestCents(listing.price_per_person) / 100).toFixed(2)
  const image = firstHttpsPhoto(listing.photo_urls)
  const description = textExcerpt(listing.description, 500) || listingPreviewDescription(listing)
  const host = hostName(listing)
  const reviews = ratingSummary(rating)
  const place = {
    '@type': 'Place',
    name: listing.area ? `${listing.area}, Singapore` : 'Singapore',
    address: {
      '@type': 'PostalAddress',
      ...(listing.area ? { addressLocality: listing.area } : {}),
      addressCountry: 'SG',
    },
  }
  const provider = host
    ? {
        '@type': 'Person',
        name: host,
        ...(listing.host_id ? { url: `${origin}/u/${listing.host_id}` } : {}),
      }
    : undefined

  const service = {
    '@type': 'Service',
    '@id': `${pageUrl}#listing`,
    name: listing.title,
    description,
    url: pageUrl,
    ...(image ? { image } : {}),
    ...(listing.category ? { category: listing.category } : {}),
    areaServed: place,
    ...(provider ? { provider } : {}),
    offers: { '@type': 'Offer', price, priceCurrency: 'SGD', url: pageUrl },
    ...(reviews
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: reviews.average,
            reviewCount: reviews.count,
            bestRating: 5,
          },
        }
      : {}),
  }

  const events = sessions
    .filter((session) => formatSessionDateTime(session.starts_at))
    .map((session) => {
      const endDate = sessionEnd(session, listing)
      const full = !(Number(session.spots_remaining) > 0)
      return {
        '@type': 'Event',
        name: listing.title,
        description,
        url: pageUrl,
        startDate: session.starts_at,
        ...(endDate ? { endDate } : {}),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: place,
        ...(image ? { image } : {}),
        ...(provider ? { organizer: provider, performer: provider } : {}),
        ...(Number.isInteger(listing.max_guests) && listing.max_guests > 0
          ? { maximumAttendeeCapacity: listing.max_guests }
          : {}),
        offers: {
          '@type': 'Offer',
          price,
          priceCurrency: 'SGD',
          url: pageUrl,
          availability: full ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
        },
      }
    })

  return { '@context': 'https://schema.org', '@graph': [service, ...events] }
}

/** A JSON-LD script tag. `<` is escaped so no string in the data can close the tag. */
export function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `<script type="application/ld+json">${json}</script>`
}

const EMPTY_ROOT = '<div id="root"></div>'

/** Put crawler HTML inside the empty #root. Unchanged if index.html no longer has one. */
export function injectRootContent(html, bodyHtml) {
  if (!html.includes(EMPTY_ROOT)) return html
  return html.replace(EMPTY_ROOT, () => `<div id="root">${bodyHtml}</div>`)
}

const PREVIEW_START = '<!-- link-preview:start -->'
const PREVIEW_END = '<!-- link-preview:end -->'

/**
 * Search engines show `description`; unfurlers show og:description, which
 * stays the short price and area line. `structuredData` adds a JSON-LD tag.
 */
export function previewTags(meta) {
  const tags = [
    `<meta name="description" content="${escapeHtml(meta.searchDescription ?? meta.description)}" />`,
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
  if (meta.structuredData) tags.push(jsonLdScript(meta.structuredData))
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
  // A function replacement, so a "$&" in a listing title stays literal.
  return withTags.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(meta.title)}</title>`)
}
