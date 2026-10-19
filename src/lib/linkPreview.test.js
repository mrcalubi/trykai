import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cardPriceForOneGuestCents,
  escapeHtml,
  injectPreviewMeta,
  isListingId,
  listingPreviewDescription,
  listingPreviewMeta,
  previewTags,
} from '../../api/_lib/linkPreview.js'
import { formatGuestFacingPrice } from './pricing'

const ID = '0b6c2f1e-8d1a-4f43-9a7e-2c5d8e9f1a2b'
const listing = {
  title: 'Latte art for beginners',
  area: 'Bukit Merah',
  price_per_person: 2500,
  photo_urls: ['https://x.supabase.co/storage/v1/object/public/listing-photos/u/cover.jpg'],
}
const indexHtml = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8')

describe('cardPriceForOneGuestCents', () => {
  it('matches formatGuestFacingPrice for every price a listing can have', () => {
    // Every cent from S$0.01 to S$500 (the 00028 ceiling).
    for (let cents = 1; cents <= 50000; cents += 1) {
      const expected = formatGuestFacingPrice(cents)
      const actual = `$${new Intl.NumberFormat('en-SG').format(cardPriceForOneGuestCents(cents) / 100)}`
      if (actual !== expected) throw new Error(`${cents}: preview ${actual}, app ${expected}`)
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
