import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bookingConfirmedGuestHtml,
  bookingConfirmedHostHtml,
  escapeHtml,
  formatSessionDate,
  sendResendEmail,
  verificationApprovedHtml,
  verificationRejectedHtml,
} from './email.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('verification result emails', () => {
  it('points an approved host at the listing form', () => {
    const html = verificationApprovedHtml({ hostName: 'Mei Ling' })
    expect(html).toContain('Mei Ling')
    expect(html).toContain('https://trykai.sg/create-listing')
  })

  it('greets an approved host without a name on file', () => {
    expect(verificationApprovedHtml({ hostName: null })).toContain("You're verified!")
  })

  it('tells a rejected host what to fix and where to resubmit', () => {
    const html = verificationRejectedHtml({
      hostName: 'Mei Ling',
      reason: 'The ID photo is too blurry to read',
    })
    expect(html).toContain('Mei Ling')
    expect(html).toContain('The ID photo is too blurry to read')
    expect(html).toContain('https://trykai.sg/verify-identity')
  })

  it('greets a rejected host without a name on file', () => {
    expect(verificationRejectedHtml({ hostName: null, reason: 'blurry' })).toContain('Hi,')
  })

  it('escapes the reason, which a reviewer typed by hand', () => {
    const html = verificationRejectedHtml({
      hostName: 'Mei Ling',
      reason: '<script>alert("x")</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('escapeHtml', () => {
  it('escapes the five characters that break out of an attribute or element', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
  })

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('The ID photo is blurry')).toBe('The ID photo is blurry')
  })
})

describe('booking confirmation emails', () => {
  it('names the listing and session for the guest', () => {
    const html = bookingConfirmedGuestHtml({
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestsCount: 1,
    })
    expect(html).toContain('Latte art')
    expect(html).toContain('28 Aug 2026, 7:00 pm')
    expect(html).toContain('https://trykai.sg/dashboard')
  })

  it('names the guest for the host', () => {
    const html = bookingConfirmedHostHtml({
      guestName: 'Sarah',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestsCount: 2,
    })
    expect(html).toContain('Sarah')
    expect(html).toContain('<p><strong>Guests:</strong> 2</p>')
  })
})

describe('formatSessionDate', () => {
  it('formats in Singapore time', () => {
    const text = formatSessionDate('2026-08-28T11:00:00.000Z')
    expect(text).toMatch(/2026/)
    expect(text.length).toBeGreaterThan(8)
  })
})

describe('sendResendEmail', () => {
  it('does nothing without an API key or recipient', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await sendResendEmail({ apiKey: undefined, to: 'a@b.c', subject: 'Hi', html: '<p>Hi</p>' })
    await sendResendEmail({ apiKey: 're_test', to: null, subject: 'Hi', html: '<p>Hi</p>' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts to Resend when both key and recipient are present', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await sendResendEmail({
      apiKey: 're_test',
      to: 'host@trykai.sg',
      subject: 'New booking',
      html: '<p>Booked</p>',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_test')
    expect(JSON.parse(init.body)).toMatchObject({
      to: 'host@trykai.sg',
      subject: 'New booking',
    })
  })
})
