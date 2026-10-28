import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cardPriceForOneGuestCents,
  escapeHtml,
  formatDuration as previewFormatDuration,
  formatSessionDateTime,
  injectPreviewMeta,
  injectRootContent,
  isListingId,
  jsonLdScript,
  listingPageBody,
  listingPreviewDescription,
  listingPreviewMeta,
  listingSearchDescription,
  listingStructuredData,
  previewTags,
  spotsLabel as previewSpotsLabel,
  textExcerpt,
} from '../../api/_lib/linkPreview.js'
import { formatDuration } from './duration'
import { spotsLabel } from './listingSpots'
import { formatGuestFacingPrice, guestFacingPriceCents } from './pricing'

const ID = '0b6c2f1e-8d1a-4f43-9a7e-2c5d8e9f1a2b'
const listing = {
  title: 'Latte art for beginners',
  area: 'Bukit Merah',
  price_per_person: 2500,
  photo_urls: ['https://x.supabase.co/storage/v1/object/public/listing-photos/u/cover.jpg'],
}
const indexHtml = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8')

describe('cardPriceForOneGuestCents', () => {
  it('matches the app price in cents for every price a listing can have', () => {
    // Every cent from S$0.01 to S$500 (the 00028 ceiling). Compares cents, not
    // formatted strings: formatting 50,000 prices twice was too slow for CI.
    for (let cents = 1; cents <= 50000; cents += 1) {
      const app = guestFacingPriceCents(cents)
      const preview = cardPriceForOneGuestCents(cents)
      if (preview !== app) throw new Error(`${cents}: preview ${preview}, app ${app}`)
    }
  })

  it('formats the same as the app for typical and large prices', () => {
    for (const cents of [100, 1000, 1550, 2500, 3999, 12345, 50000]) {
      expect(listingPreviewDescription({ price_per_person: cents })).toBe(
        `S${formatGuestFacingPrice(cents)} per person`,
      )
    }
  })
})

describe('isListingId', () => {
  it('accepts a uuid and rejects anything else', () => {
    expect(isListingId(ID)).toBe(true)
    expect(isListingId(ID.toUpperCase())).toBe(true)
    expect(isListingId('abc')).toBe(false)
    expect(isListingId(`${ID}&select=*`)).toBe(false)
    expect(isListingId(undefined)).toBe(false)
  })
})

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`"><script>alert('x')</script>&`)).toBe(
      '&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;',
    )
    expect(escapeHtml(null)).toBe('')
  })
})

describe('listingPreviewDescription', () => {
  it('uses the same all-in card price as browse, with the area', () => {
    expect(listingPreviewDescription(listing)).toBe(
      `S${formatGuestFacingPrice(2500)} per person · Bukit Merah`,
    )
    expect(listingPreviewDescription(listing)).toMatch(/^S\$\d+ per person · /)
  })

  it('leaves the area off when there is none', () => {
    expect(listingPreviewDescription({ ...listing, area: null })).toMatch(/^S\$\d+ per person$/)
  })
})

describe('listingPreviewMeta', () => {
  it('builds a large-image preview from the cover photo', () => {
    const meta = listingPreviewMeta(listing, `https://trykai.sg/listings/${ID}`)
    expect(meta).toMatchObject({
      title: 'Latte art for beginners · TryKai',
      url: `https://trykai.sg/listings/${ID}`,
      image: listing.photo_urls[0],
      card: 'summary_large_image',
    })
  })

  it('falls back to a small card with no image when there is no https photo', () => {
    expect(listingPreviewMeta({ ...listing, photo_urls: [] }, 'u')).toMatchObject({
      image: null,
      card: 'summary',
    })
    expect(listingPreviewMeta({ ...listing, photo_urls: ['http://x/a.jpg'] }, 'u').image).toBeNull()
    expect(listingPreviewMeta({ ...listing, photo_urls: null }, 'u').image).toBeNull()
  })

  it('returns null when the row cannot make a preview', () => {
    expect(listingPreviewMeta(null, 'u')).toBeNull()
    expect(listingPreviewMeta({ ...listing, title: '' }, 'u')).toBeNull()
    expect(listingPreviewMeta({ ...listing, price_per_person: null }, 'u')).toBeNull()
    expect(listingPreviewMeta({ ...listing, price_per_person: 0 }, 'u')).toBeNull()
    expect(listingPreviewMeta({ ...listing, price_per_person: '2500' }, 'u')).toBeNull()
  })
})

describe('previewTags', () => {
  it('omits url and image tags when they are missing', () => {
    const tags = previewTags({ title: 'T', description: 'D', url: null, image: null, card: 'summary' })
    expect(tags).not.toMatch(/og:url|og:image|twitter:image/)
    expect(tags).toMatch(/twitter:card" content="summary"/)
  })
})

describe('injectPreviewMeta', () => {
  it('replaces the default tags in the real index.html', () => {
    const meta = listingPreviewMeta(
      { ...listing, title: 'Tea & "talk"' },
      `https://trykai.sg/listings/${ID}`,
    )
    const html = injectPreviewMeta(indexHtml, meta)
    expect(html).toContain('<meta property="og:title" content="Tea &amp; &quot;talk&quot; · TryKai" />')
    expect(html).toContain(`<meta property="og:image" content="${listing.photo_urls[0]}" />`)
    expect(html).toContain('<title>Tea &amp; &quot;talk&quot; · TryKai</title>')
    expect(html).not.toContain('find your thing in Singapore')
    expect(html.match(/property="og:title"/g)).toHaveLength(1)
    // The app itself is untouched.
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('src="/src/main.jsx"')
  })

  it('leaves the HTML alone when the markers are missing', () => {
    const html = '<html><head><title>X</title></head></html>'
    expect(injectPreviewMeta(html, listingPreviewMeta(listing, 'u'))).toBe(html)
  })
})

describe('index.html default preview', () => {
  it('uses an absolute image URL, which unfurlers require', () => {
    expect(indexHtml).toContain('<meta property="og:image" content="https://trykai.sg/trykai.png" />')
    expect(indexHtml).not.toMatch(/og:image" content="\//)
  })
})

describe('copies of app formatters', () => {
  it('formats durations the same as the app', () => {
    for (const mins of [null, 0, 30, 60, 90, 120, 390, '45']) {
      expect(previewFormatDuration(mins)).toBe(formatDuration(mins))
    }
  })

  it('labels spots the same as the app', () => {
    for (const n of [null, -1, 0, 1, 2, 4, 5, 12]) {
      expect(previewSpotsLabel(n)).toBe(spotsLabel(n))
    }
  })
})

describe('formatSessionDateTime', () => {
  it('uses Singapore time and always shows the year', () => {
    // 06:00 UTC is 2:00 pm in Singapore.
    const text = formatSessionDateTime('2027-03-20T06:00:00Z')
    expect(text).toMatch(/Sat/)
    expect(text).toMatch(/20 Mar 2027/)
    expect(text).toMatch(/2:00\s?pm/i)
    expect(formatSessionDateTime('not a date')).toBe('')
  })
})

describe('textExcerpt', () => {
  it('keeps short text whole on one line', () => {
    expect(textExcerpt('  Pull a shot.\n\nThen pour.  ')).toBe('Pull a shot. Then pour.')
    expect(textExcerpt(null)).toBe('')
  })

  it('cuts long text at a word with an ellipsis', () => {
    const text = textExcerpt('word '.repeat(60), 40)
    expect(text.length).toBeLessThanOrEqual(40)
    expect(text).toMatch(/word…$/)
  })
})

describe('listingSearchDescription', () => {
  it('adds the start of the description after price and area', () => {
    expect(listingSearchDescription({ ...listing, description: 'Learn to steam milk.' })).toBe(
      `S${formatGuestFacingPrice(2500)} per person · Bukit Merah. Learn to steam milk.`,
    )
    expect(listingSearchDescription(listing)).toBe(listingPreviewDescription(listing))
  })
})

const ORIGIN = 'https://trykai.sg'
const PAGE_URL = `${ORIGIN}/listings/${ID}`
const HOST_ID = '5f0c2a9e-1b2c-4d3e-8f9a-0b1c2d3e4f5a'
const fullListing = {
  ...listing,
  description: 'Pull a shot, steam milk, pour a heart.\n\nCups are yours to keep.\nNo experience needed.',
  category: 'Food & Drink',
  duration_mins: 120,
  max_guests: 6,
  whats_provided: ['Espresso machine', '  ', 'Milk'],
  what_to_bring: ['An apron'],
  host_id: HOST_ID,
  users: { display_name: 'Mei <Barista>', is_id_verified: true },
}
const sessions = [
  { starts_at: '2027-03-20T06:00:00Z', duration_mins: 90, spots_remaining: 2 },
  { starts_at: '2027-03-27T06:00:00Z', duration_mins: null, spots_remaining: 0 },
]
const page = { pageUrl: PAGE_URL, origin: ORIGIN, sessions, rating: { average: '4.75', review_count: 12 } }

describe('listingPageBody', () => {
  const html = listingPageBody(fullListing, page)

  it('shows the listing facts as plain HTML', () => {
    expect(html).toContain('<h1>Latte art for beginners</h1>')
    expect(html).toContain('<p>Food &amp; Drink · Bukit Merah, Singapore</p>')
    expect(html).toContain(`<li>Price: S${formatGuestFacingPrice(2500)} per person, all in</li>`)
    expect(html).toContain('<li>Duration: 2 hr</li>')
    expect(html).toContain('<li>Group size: up to 6 guests</li>')
    expect(html).toContain('<li>Rating: 4.8 out of 5 from 12 reviews</li>')
    expect(html).toContain(`<img src="${listing.photo_urls[0]}" alt="Latte art for beginners" />`)
  })

  it('escapes the host name and links the host profile', () => {
    expect(html).toContain(`<a href="${ORIGIN}/u/${HOST_ID}">Mei &lt;Barista&gt;</a> (ID-verified)`)
    expect(html).not.toContain('<Barista>')
  })

  it('keeps description paragraphs and line breaks', () => {
    expect(html).toContain('<p>Pull a shot, steam milk, pour a heart.</p>')
    expect(html).toContain('<p>Cups are yours to keep.<br />No experience needed.</p>')
  })

  it('lists what is provided and what to bring, skipping blanks', () => {
    expect(html).toContain("<h2>What's provided</h2><ul><li>Espresso machine</li><li>Milk</li></ul>")
    expect(html).toContain('<h2>What to bring</h2><ul><li>An apron</li></ul>')
  })

  it('lists upcoming sessions with spots, and never an address', () => {
    expect(html).toContain('<time datetime="2027-03-20T06:00:00Z">')
    expect(html).toContain('· 2 spots left</li>')
    expect(html).toContain('· Full</li>')
    expect(html).toContain('The exact address is shared once your booking is confirmed.')
    expect(html).toContain(`<a href="${PAGE_URL}">Book Latte art for beginners on TryKai</a>`)
  })

  it('handles a bare listing with no extras', () => {
    const bare = listingPageBody({ ...listing, area: null }, { pageUrl: PAGE_URL, origin: ORIGIN })
    expect(bare).toContain('<p>Singapore</p>')
    expect(bare).toContain('<p>No sessions are scheduled right now.</p>')
    expect(bare).not.toMatch(/Duration|Group size|Rating|Host:|About this session|What to bring/)
  })

  it('says "review" for a single review', () => {
    const one = listingPageBody(fullListing, { ...page, rating: { average: 5, review_count: 1 } })
    expect(one).toContain('<li>Rating: 5 out of 5 from 1 review</li>')
  })
})

describe('listingStructuredData', () => {
  const data = listingStructuredData(fullListing, page)
  const [service, ...events] = data['@graph']
  const price = (guestFacingPriceCents(2500) / 100).toFixed(2)

  it('describes the listing as a Service with the all-in price and rating', () => {
    expect(data['@context']).toBe('https://schema.org')
    expect(service).toMatchObject({
      '@type': 'Service',
      name: 'Latte art for beginners',
      url: PAGE_URL,
      category: 'Food & Drink',
      provider: { '@type': 'Person', name: 'Mei <Barista>', url: `${ORIGIN}/u/${HOST_ID}` },
      offers: { price, priceCurrency: 'SGD' },
      aggregateRating: { ratingValue: 4.8, reviewCount: 12, bestRating: 5 },
      areaServed: { address: { addressLocality: 'Bukit Merah', addressCountry: 'SG' } },
    })
  })

  it('adds one Event per upcoming session with its own end time and availability', () => {
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      '@type': 'Event',
      startDate: '2027-03-20T06:00:00Z',
      endDate: '2027-03-20T07:30:00.000Z',
      maximumAttendeeCapacity: 6,
      offers: { price, availability: 'https://schema.org/InStock' },
    })
    // Falls back to the listing's 120 minutes.
    expect(events[1].endDate).toBe('2027-03-27T08:00:00.000Z')
    expect(events[1].offers.availability).toBe('https://schema.org/SoldOut')
  })

  it('leaves out what a bare listing does not have', () => {
    const bare = listingStructuredData({ ...listing, area: null }, { pageUrl: PAGE_URL, origin: ORIGIN })
    expect(bare['@graph']).toHaveLength(1)
    expect(bare['@graph'][0]).not.toHaveProperty('provider')
    expect(bare['@graph'][0]).not.toHaveProperty('aggregateRating')
    expect(bare['@graph'][0].areaServed.address).toEqual({ '@type': 'PostalAddress', addressCountry: 'SG' })
    expect(bare['@graph'][0].description).toBe(listingPreviewDescription({ ...listing, area: null }))
  })
})

describe('jsonLdScript', () => {
  it('cannot be closed early by data', () => {
    const name = '</script><script>alert(1)</script>'
    const tag = jsonLdScript({ name })
    expect(tag.match(/<\/script>/g)).toHaveLength(1)
    const json = tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('<'))
    expect(JSON.parse(json)).toEqual({ name })
  })
})

describe('crawler page from the real index.html', () => {
  const meta = listingPreviewMeta(fullListing, PAGE_URL)
  meta.structuredData = listingStructuredData(fullListing, page)
  const html = injectRootContent(injectPreviewMeta(indexHtml, meta), listingPageBody(fullListing, page))

  it('puts the listing inside #root and JSON-LD in the head', () => {
    expect(html).toMatch(/<div id="root"><main><article>.*<h1>Latte art for beginners<\/h1>/s)
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('<script type="application/ld+json">')
    expect(html).toContain('src="/src/main.jsx"')
  })

  it('uses the longer search description and keeps the short unfurl one', () => {
    expect(html).toContain(
      `<meta name="description" content="${escapeHtml(listingSearchDescription(fullListing))}" />`,
    )
    expect(html).toContain(
      `<meta property="og:description" content="${escapeHtml(listingPreviewDescription(fullListing))}" />`,
    )
  })

  it('keeps a "$&" in the title literal', () => {
    const withDollar = injectPreviewMeta(
      indexHtml,
      listingPreviewMeta({ ...listing, title: 'Save $& more' }, 'u'),
    )
    expect(withDollar).toContain('<title>Save $&amp; more · TryKai</title>')
  })

  it('leaves HTML without an empty #root alone', () => {
    expect(injectRootContent('<div id="app"></div>', '<p>x</p>')).toBe('<div id="app"></div>')
  })
})
