import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bookingCancelledGuestHtml,
  bookingCancelledHostHtml,
  bookingConfirmedGuestHtml,
  bookingConfirmedHostHtml,
  bookingReference,
  escapeHtml,
  formatCents,
  formatDuration,
  formatPaymentMethod,
  formatSessionDate,
  paymentMethodFromIntent,
  publicDisplayName,
  receiptPriceLines,
  refundDeadlineLines,
  resolvePaymentMethod,
  sendCancellationEmails,
  hostPayoutLine,
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

const SESSION_STARTS = '2026-08-28T11:00:00.000Z'

function guestReceipt(overrides = {}) {
  return bookingConfirmedGuestHtml({
    bookingReference: 'A1B2C3D4',
    listingTitle: 'Latte art',
    hostName: 'Mei Ling',
    sessionDate: formatSessionDate(SESSION_STARTS),
    duration: '1 hr 30 min',
    fullAddress: '12 Club Street, Singapore 069410',
    guestsCount: 4,
    pricePerPersonCents: 2500,
    groupPricing: true,
    paymentRail: 'paynow',
    totalPaidCents: 9120,
    paymentMethod: 'PayNow',
    sessionStartsAt: SESSION_STARTS,
    guestId: 'guest-1',
    siteUrl: 'https://trykai.sg',
    ...overrides,
  })
}

describe('bookingReference', () => {
  it('takes the first 8 characters and uppercases them', () => {
    expect(bookingReference('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('A1B2C3D4')
  })
})

describe('formatDuration', () => {
  it('uses hours and minutes the way listing pages do', () => {
    expect(formatDuration(90)).toBe('1 hr 30 min')
    expect(formatDuration(60)).toBe('1 hr')
    expect(formatDuration(45)).toBe('45 min')
  })
})

describe('publicDisplayName', () => {
  it('prefers display_name and falls back to the first name', () => {
    expect(publicDisplayName({ display_name: 'Mei', full_name: 'Mei Ling Tan' })).toBe('Mei')
    expect(publicDisplayName({ display_name: '  ', full_name: 'Mei Ling Tan' })).toBe('Mei')
  })
})

describe('payment method', () => {
  it('names PayNow, or the card brand and last 4', () => {
    expect(formatPaymentMethod({ paymentRail: 'paynow' })).toBe('PayNow')
    expect(formatPaymentMethod({ paymentRail: 'card', cardBrand: 'visa', cardLast4: '4242' })).toBe(
      'Visa ending in 4242',
    )
    expect(formatPaymentMethod({ paymentRail: 'card' })).toBe('Card')
  })

  it('reads brand and last 4 from an expanded PaymentIntent charge', () => {
    expect(
      paymentMethodFromIntent('card', {
        latest_charge: {
          payment_method_details: { card: { brand: 'mastercard', last4: '4444' } },
        },
      }),
    ).toBe('Mastercard ending in 4444')
  })

  it('does not retrieve a Stripe intent when the rail is PayNow', async () => {
    const retrieveIntent = vi.fn()
    await expect(
      resolvePaymentMethod({ paymentRail: 'paynow', retrieveIntent }),
    ).resolves.toBe('PayNow')
    expect(retrieveIntent).not.toHaveBeenCalled()
  })

  it('falls back to Card when retrieve fails', async () => {
    await expect(
      resolvePaymentMethod({
        paymentRail: 'card',
        retrieveIntent: async () => {
          throw new Error('stripe down')
        },
      }),
    ).resolves.toBe('Card')
  })
})

describe('receiptPriceLines', () => {
  it('shows the all-in unit price, never a booking fee', () => {
    const lines = receiptPriceLines({
      pricePerPersonCents: 2500,
      guestsCount: 1,
      paymentRail: 'card',
      totalPaidCents: 2800,
    })
    expect(lines[0]).toBe('$28 per person x 1 guests')
    expect(lines.at(-1)).toBe('Total paid $28')
    expect(lines.join('\n')).not.toMatch(/booking fee|platform fee/i)
  })

  it('adds a group discount line when the rate is above zero', () => {
    const lines = receiptPriceLines({
      pricePerPersonCents: 2500,
      guestsCount: 4,
      groupPricing: true,
      paymentRail: 'card',
      totalPaidCents: 9600,
    })
    expect(lines).toContain('Group discount (15%) −$16')
    expect(lines.join('\n')).not.toMatch(/booking fee|platform fee/i)
  })

  it('adds the PayNow saving against the all-in card total', () => {
    const lines = receiptPriceLines({
      pricePerPersonCents: 2500,
      guestsCount: 4,
      groupPricing: true,
      paymentRail: 'paynow',
      totalPaidCents: 9120,
    })
    expect(lines).toContain('PayNow saving $4.80')
    expect(lines).toContain('Total paid $91.20')
  })

  it('omits the group discount when the listing does not offer it', () => {
    const lines = receiptPriceLines({
      pricePerPersonCents: 2500,
      guestsCount: 4,
      groupPricing: false,
      paymentRail: 'card',
      totalPaidCents: 11200,
    })
    expect(lines.join('\n')).not.toMatch(/group discount/i)
  })
})

describe('refundDeadlineLines', () => {
  it('turns the 48 / 24 / 6 hour cutoffs into Singapore dates', () => {
    const lines = refundDeadlineLines(SESSION_STARTS)
    expect(lines[0]).toBe(`Full refund if you cancel before ${formatSessionDate('2026-08-26T11:00:00.000Z')}`)
    expect(lines[1]).toBe(`50% refund if you cancel before ${formatSessionDate('2026-08-27T11:00:00.000Z')}`)
    expect(lines[2]).toBe(`25% refund if you cancel before ${formatSessionDate('2026-08-28T05:00:00.000Z')}`)
  })
})

describe('booking confirmation emails', () => {
  it('is a guest receipt: reference, listing, host, time, duration, address, guests, price', () => {
    const html = guestReceipt()
    expect(html).toContain('Booking reference:</strong> A1B2C3D4')
    expect(html).toContain('Latte art')
    expect(html).toContain('Mei Ling')
    expect(html).toContain(formatSessionDate(SESSION_STARTS))
    expect(html).toContain('1 hr 30 min')
    expect(html).toContain('12 Club Street, Singapore 069410')
    expect(html).toContain('Guests:</strong> 4')
    expect(html).toContain('$28 per person x 4 guests')
    expect(html).toContain('Group discount (15%) −$16')
    expect(html).toContain('PayNow saving $4.80')
    expect(html).toContain('Total paid $91.20')
    expect(html).toContain('Payment method:</strong> PayNow')
    expect(html).not.toMatch(/booking fee|platform fee/i)
    expect(html).toContain(`Full refund if you cancel before ${formatSessionDate('2026-08-26T11:00:00.000Z')}`)
    expect(html).toContain(`50% refund if you cancel before ${formatSessionDate('2026-08-27T11:00:00.000Z')}`)
    expect(html).toContain(`25% refund if you cancel before ${formatSessionDate('2026-08-28T05:00:00.000Z')}`)
    expect(html).toContain('href="https://trykai.sg/u/guest-1?tab=bookings"')
    expect(html).toContain('View booking')
    expect(html).toContain('Questions for your host? Reply to this email.')
    expect(html).toContain('Browse more experiences')
    expect(html.match(/href="https:\/\/trykai\.sg"/g)?.length).toBe(1)
    expect(html).toContain('TryKai')
    expect(html).toContain('UEN 53526159D')
    expect(html).toContain('https://trykai.sg/terms')
    expect(html).toContain('https://trykai.sg/privacy')
    expect(html).not.toContain('/dashboard')
  })

  it('names the card brand and last 4 when the guest paid by card', () => {
    const html = guestReceipt({
      guestsCount: 1,
      paymentRail: 'card',
      totalPaidCents: 2800,
      paymentMethod: 'Visa ending in 4242',
    })
    expect(html).toContain('$28 per person x 1 guests')
    expect(html).toContain('Total paid $28')
    expect(html).toContain('Visa ending in 4242')
    expect(html).not.toMatch(/group discount/i)
    expect(html).not.toMatch(/PayNow saving/)
    expect(html).not.toMatch(/booking fee|platform fee/i)
  })

  it('escapes listing copy a host typed', () => {
    const html = guestReceipt({
      listingTitle: '<script>x</script>',
      hostName: '<b>Mei</b>',
      fullAddress: '<img src=x>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;Mei&lt;/b&gt;')
  })

  it('tells the host the reference, guest display name, and payout after any host fee', () => {
    const html = bookingConfirmedHostHtml({
      bookingReference: 'A1B2C3D4',
      guestName: 'Sarah',
      listingTitle: 'Latte art',
      sessionDate: formatSessionDate(SESSION_STARTS),
      guestsCount: 4,
      hostPayoutCents: 8500,
    })
    expect(html).toContain('Booking reference:</strong> A1B2C3D4')
    expect(html).toContain('Sarah')
    expect(html).toContain('Latte art')
    expect(html).toContain(formatSessionDate(SESSION_STARTS))
    expect(html).toContain('Guests:</strong> 4')
    expect(html).toContain("You'll receive $85")
    expect(html).toContain('UEN 53526159D')
    expect(html).not.toMatch(/booking fee|platform fee|host fee/i)
    expect(html).not.toMatch(/Total paid|Refund amount|Refund method/i)
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
    expect(JSON.parse(init.body)).not.toHaveProperty('reply_to')
  })

  it('sets reply_to when the guest confirmation asks them to reply', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await sendResendEmail({
      apiKey: 're_test',
      to: 'guest@trykai.sg',
      subject: 'Booking confirmed: Latte art',
      html: '<p>Confirmed</p>',
      replyTo: 'hello@trykai.sg',
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      from: 'TryKai <no-reply@trykai.sg>',
      to: 'guest@trykai.sg',
      reply_to: 'hello@trykai.sg',
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

  it('groups thousands the way a guest reads a price', () => {
    expect(formatCents(135800)).toBe('$1,358')
  })
})

describe('cancellation emails', () => {
  it('always states the guest refund amount, including zero, plus reference and method', () => {
    const none = bookingCancelledGuestHtml({
      bookingReference: 'A1B2C3D4',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      refundAmountCents: 0,
      cancelledBy: 'guest',
      guestsCount: 2,
      paymentMethod: 'PayNow',
    })
    expect(none).toContain('Booking reference:</strong> A1B2C3D4')
    expect(none).toContain('Guests:')
    expect(none).toContain('2')
    expect(none).toContain('Refund amount:')
    expect(none).toContain('$0')
    expect(none).toContain('Latte art')
    expect(none).toContain('Refund method:</strong> PayNow')
    expect(none).toContain('UEN 53526159D')

    const full = bookingCancelledGuestHtml({
      bookingReference: 'A1B2C3D4',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      refundAmountCents: 5100,
      cancelledBy: 'host',
      guestsCount: 2,
      paymentMethod: 'Visa ending in 4242',
    })
    expect(full).toContain('$51')
    expect(full).toContain('The host cancelled your booking')
    expect(full).toContain('Visa ending in 4242')
  })

  it('escapes listing titles that a host typed', () => {
    const html = bookingCancelledGuestHtml({
      bookingReference: 'A1B2C3D4',
      listingTitle: '<script>x</script>',
      sessionDate: '28 Aug 2026, 7:00 pm',
      refundAmountCents: 0,
      cancelledBy: 'guest',
      guestsCount: 1,
      paymentMethod: 'Card',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('tells the host what they will receive, never the guest refund', () => {
    const kept = bookingCancelledHostHtml({
      bookingReference: 'A1B2C3D4',
      guestName: 'Sarah',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestsCount: 3,
      hostPayoutCents: 4250,
    })
    expect(kept).toContain('Booking reference:</strong> A1B2C3D4')
    expect(kept).toContain('Sarah')
    expect(kept).toContain('Latte art')
    expect(kept).toContain('Guests:')
    expect(kept).toContain('3')
    expect(kept).toContain("You'll receive $42.50")
    expect(kept).not.toMatch(/Refund amount|Refund method|Total paid|PayNow|ending in/i)

    const none = bookingCancelledHostHtml({
      bookingReference: 'A1B2C3D4',
      guestName: 'Sarah',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestsCount: 3,
      hostPayoutCents: 0,
    })
    expect(none).toContain("You won't receive a payout for this booking")
    expect(none).not.toMatch(/You'll receive \$/)
  })

  it('wording for a host payout never mentions a guest charge', () => {
    expect(hostPayoutLine(8500)).toBe("You'll receive $85")
    expect(hostPayoutLine(0)).toBe("You won't receive a payout for this booking")
  })

  it('emails the guest always, and the host only when the guest cancelled', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendCancellationEmails({
      apiKey: 're_test',
      cancelledBy: 'host',
      refundAmountCents: 5100,
      bookingReference: 'A1B2C3D4',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestEmail: 'guest@trykai.sg',
      hostEmail: 'host@trykai.sg',
      guestName: 'Sarah',
      guestsCount: 2,
      paymentMethod: 'Visa ending in 4242',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      from: 'TryKai <no-reply@trykai.sg>',
      to: 'guest@trykai.sg',
      subject: 'Booking cancelled: Latte art',
    })
    const hostCancelHtml = JSON.parse(fetchMock.mock.calls[0][1].body).html
    expect(hostCancelHtml).toContain('$51')
    expect(hostCancelHtml).toContain('A1B2C3D4')
    expect(hostCancelHtml).toContain('Visa ending in 4242')

    fetchMock.mockClear()

    await sendCancellationEmails({
      apiKey: 're_test',
      cancelledBy: 'guest',
      refundAmountCents: 0,
      bookingReference: 'A1B2C3D4',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestEmail: 'guest@trykai.sg',
      hostEmail: 'host@trykai.sg',
      guestName: 'Sarah',
      guestsCount: 2,
      paymentMethod: 'PayNow',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).toContain('$0')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      to: 'host@trykai.sg',
      subject: 'A guest cancelled "Latte art"',
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).html).toContain('A1B2C3D4')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).html).toContain(
      "You won't receive a payout for this booking",
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).html).not.toMatch(/Refund amount|PayNow/)
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
        bookingReference: 'A1B2C3D4',
        listingTitle: 'Latte art',
        sessionDate: '28 Aug 2026, 7:00 pm',
        guestEmail: 'guest@trykai.sg',
        hostEmail: 'host@trykai.sg',
        guestsCount: 1,
        paymentMethod: 'Card',
      }),
    ).resolves.toBeUndefined()

    errorMock.mockRestore()
  })
})
