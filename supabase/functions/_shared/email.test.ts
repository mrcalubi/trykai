import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bookingCancelledGuestHtml,
  bookingCancelledHostHtml,
  bookingConfirmedGuestHtml,
  bookingConfirmedHostHtml,
  escapeHtml,
  formatCents,
  formatSessionDate,
  sendCancellationEmails,
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
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchMock)
    await sendResendEmail({ apiKey: undefined, to: 'a@b.c', subject: 'Hi', html: '<p>Hi</p>' })
    await sendResendEmail({ apiKey: 're_test', to: null, subject: 'Hi', html: '<p>Hi</p>' })
    expect(fetchMock).not.toHaveBeenCalled()
    errorMock.mockRestore()
  })

  it('logs when the API key is missing so a forgotten secret shows up in logs', async () => {
    const fetchMock = vi.fn()
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchMock)

    await sendResendEmail({
      apiKey: undefined,
      to: 'guest@trykai.sg',
      subject: 'Booking cancelled: Latte art',
      html: '<p>Cancelled</p>',
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(errorMock).toHaveBeenCalled()
    expect(String(errorMock.mock.calls[0][0])).toMatch(/RESEND_API_KEY/)
    errorMock.mockRestore()
  })

  it('does not log a missing key when the recipient is simply absent', async () => {
    const fetchMock = vi.fn()
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchMock)

    await sendResendEmail({ apiKey: 're_test', to: null, subject: 'Hi', html: '<p>Hi</p>' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(errorMock).not.toHaveBeenCalled()
    errorMock.mockRestore()
  })

  it('swallows a Resend network failure instead of throwing', async () => {
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    await expect(
      sendResendEmail({
        apiKey: 're_test',
        to: 'guest@trykai.sg',
        subject: 'Hi',
        html: '<p>Hi</p>',
      }),
    ).resolves.toBeUndefined()
    expect(errorMock).toHaveBeenCalled()
    errorMock.mockRestore()
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
      from: 'TryKai <no-reply@trykai.sg>',
      to: 'host@trykai.sg',
      subject: 'New booking',
    })
  })
})

describe('formatCents', () => {
  it('drops the decimals on a whole dollar', () => {
    expect(formatCents(5100)).toBe('$51')
  })

  it('keeps two decimals when the amount is not a whole dollar', () => {
    expect(formatCents(956)).toBe('$9.56')
  })

  it('still renders zero as an amount', () => {
    expect(formatCents(0)).toBe('$0')
  })
})

describe('cancellation emails', () => {
  it('always states the guest refund amount, including zero', () => {
    const none = bookingCancelledGuestHtml({
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      refundAmountCents: 0,
      cancelledBy: 'guest',
    })
    expect(none).toContain('Refund amount:')
    expect(none).toContain('$0')
    expect(none).toContain('Latte art')

    const full = bookingCancelledGuestHtml({
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      refundAmountCents: 5100,
      cancelledBy: 'host',
    })
    expect(full).toContain('$51')
    expect(full).toContain('The host cancelled your booking')
  })

  it('escapes listing titles that a host typed', () => {
    const html = bookingCancelledGuestHtml({
      listingTitle: '<script>x</script>',
      sessionDate: '28 Aug 2026, 7:00 pm',
      refundAmountCents: 0,
      cancelledBy: 'guest',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('names the guest for the host', () => {
    const html = bookingCancelledHostHtml({
      guestName: 'Sarah',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
    })
    expect(html).toContain('Sarah')
    expect(html).toContain('Latte art')
  })

  it('emails the guest always, and the host only when the guest cancelled', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendCancellationEmails({
      apiKey: 're_test',
      cancelledBy: 'host',
      refundAmountCents: 5100,
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestEmail: 'guest@trykai.sg',
      hostEmail: 'host@trykai.sg',
      guestName: 'Sarah',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      from: 'TryKai <no-reply@trykai.sg>',
      to: 'guest@trykai.sg',
      subject: 'Booking cancelled: Latte art',
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).toContain('$51')

    fetchMock.mockClear()

    await sendCancellationEmails({
      apiKey: 're_test',
      cancelledBy: 'guest',
      refundAmountCents: 0,
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestEmail: 'guest@trykai.sg',
      hostEmail: 'host@trykai.sg',
      guestName: 'Sarah',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).toContain('$0')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      to: 'host@trykai.sg',
      subject: 'A guest cancelled "Latte art"',
    })
  })

  it('does not throw when Resend is down, so a refund already issued is not rolled back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendCancellationEmails({
        apiKey: 're_test',
        cancelledBy: 'guest',
        refundAmountCents: 0,
        listingTitle: 'Latte art',
        sessionDate: '28 Aug 2026, 7:00 pm',
        guestEmail: 'guest@trykai.sg',
        hostEmail: 'host@trykai.sg',
      }),
    ).resolves.toBeUndefined()

    errorMock.mockRestore()
  })
})
