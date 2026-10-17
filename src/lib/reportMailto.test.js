import { describe, expect, it } from 'vitest'
import {
  listingReportSubject,
  profileReportSubject,
  reportMailto,
  reviewReportSubject,
} from './reportMailto'

describe('reportMailto', () => {
  it('builds a mailto to hello@ with the page URL, id, and prompt', () => {
    const href = reportMailto({
      subject: 'Report: listing Latte art',
      url: 'https://trykai.sg/listings/listing-1',
      id: 'listing-1',
    })

    expect(href.startsWith('mailto:hello@trykai.sg?')).toBe(true)
    const query = new URL(href).searchParams
    expect(query.get('subject')).toBe('Report: listing Latte art')
    expect(query.get('body')).toBe(
      "https://trykai.sg/listings/listing-1\nlisting-1\n\nTell us what's wrong:"
    )
  })

  it('uses the three report subjects', () => {
    expect(listingReportSubject('Latte art')).toBe('Report: listing Latte art')
    expect(profileReportSubject('Mei')).toBe('Report: profile Mei')
    expect(reviewReportSubject('Latte art')).toBe('Report: review on Latte art')
  })
})
