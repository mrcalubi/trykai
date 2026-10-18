import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bookingCancelledGuestHtml,
  bookingCancelledGuestSubject,
  bookingCancelledHostHtml,
  bookingConfirmedGuestHtml,
  bookingConfirmedGuestSubject,
  bookingConfirmedHostHtml,
  bookingReference,
  cardDetailsFromCharge,
  disputeRefundGuestHtml,
  disputeRefundGuestSubject,
  emailSiteUrl,
  escapeHtml,
  formatCents,
  formatDuration,
  formatPaymentMethod,
  formatSessionDate,
  formatSessionDay,
  googleCalendarUrl,
  guestCountLabel,
  hostPayoutLine,
  hostRefundedGuestsLine,
  hostSessionCancelledHtml,
  paymentMethodFromIntent,
  publicDisplayName,
  receiptPriceLines,
  refundDeadlineLines,
  refundMethodNoun,
  refundTimingCopy,
  resolvePaymentMethod,
  sendCancellationEmails,
  sendDisputeRefundEmail,
  sendHostSessionCancelledEmail,
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
    guestName: 'caleb2',
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
    durationMins: 90,
    whatsProvided: ['Apron', 'Coffee beans'],
    bookingId: 'booking-1',
    siteUrl: 'https://trykai.sg',
    ...overrides,
  })
}

function guestCancelMail(overrides = {}) {
  return bookingCancelledGuestHtml({
    bookingReference: 'A1B2C3D4',
    listingTitle: 'Latte art',
    sessionDate: '28 Aug 2026, 7:00 pm',
    refundAmountCents: 5100,
    cancelledBy: 'guest',
    guestsCount: 2,
    paymentRail: 'paynow',
    paymentMethod: 'PayNow',
    guestName: 'caleb2',
    hostName: 'Mei Ling',
    listingId: 'listing-1',
    listingCategory: 'Food',
    siteUrl: 'https://trykai.sg',
    ...overrides,
  })
}

function hostCancelGuestMail(overrides = {}) {
  return bookingCancelledGuestHtml({
    bookingReference: 'A1B2C3D4',
    listingTitle: 'Latte art',
    sessionDate: '28 Aug 2026, 7:00 pm',
    refundAmountCents: 5100,
    cancelledBy: 'host',
    guestsCount: 2,
    paymentRail: 'card',
    paymentMethod: 'Visa ending in 4242',
    guestName: 'caleb2',
    hostName: 'Mei Ling',
    listingId: 'listing-1',
    listingCategory: 'Food',
    hasOtherSessions: true,
    siteUrl: 'https://trykai.sg',
    ...overrides,
  })
}

function hostSessionCancelMail(overrides = {}) {
  return hostSessionCancelledHtml({
    hostName: 'Mei Ling',
    listingTitle: 'Latte art',
    sessionDate: '28 Aug 2026, 7:00 pm',
    guestCount: 3,
    strikeCount: 2,
    siteUrl: 'https://trykai.sg',
    ...overrides,
  })
}

describe('bookingReference', () => {
  it('takes the first 8 characters and uppercases them', () => {
    expect(bookingReference('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('A1B2C3D4')
  })

  it('treats a missing id as an empty reference', () => {
    expect(bookingReference(null)).toBe('')
    expect(bookingReference(undefined)).toBe('')
  })
})

describe('formatDuration', () => {
  it('uses hours and minutes the way listing pages do', () => {
    expect(formatDuration(90)).toBe('1 hr 30 min')
    expect(formatDuration(60)).toBe('1 hr')
    expect(formatDuration(45)).toBe('45 min')
  })

  it('returns empty for missing or invalid lengths', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(Number.NaN)).toBe('')
  })
})

describe('emailSiteUrl', () => {
  it('strips a trailing slash and falls back when the value is blank', () => {
    expect(emailSiteUrl('https://trykai.sg/')).toBe('https://trykai.sg')
    expect(emailSiteUrl('   ')).toBe('https://trykai.sg')
    expect(emailSiteUrl(null)).toBe('https://trykai.sg')
  })
})

describe('publicDisplayName', () => {
  it('prefers display_name and falls back to the first name', () => {
    expect(publicDisplayName({ display_name: 'Mei', full_name: 'Mei Ling Tan' })).toBe('Mei')
    expect(publicDisplayName({ display_name: '  ', full_name: 'Mei Ling Tan' })).toBe('Mei')
  })

  it('returns empty when there is no public name to show', () => {
    expect(publicDisplayName(null)).toBe('')
    expect(publicDisplayName({ display_name: null, full_name: null })).toBe('')
    expect(publicDisplayName({ display_name: '', full_name: '   ' })).toBe('')
  })
})

describe('payment method', () => {
  it('names PayNow, or the card brand and last 4', () => {
    expect(formatPaymentMethod({ paymentRail: 'paynow' })).toBe('PayNow')
    expect(formatPaymentMethod({ paymentRail: 'card', cardBrand: 'visa', cardLast4: '4242' })).toBe(
      'Visa ending in 4242',
    )
    expect(formatPaymentMethod({ paymentRail: 'card' })).toBe('Card')
    expect(formatPaymentMethod({ paymentRail: 'card', cardLast4: '4242' })).toBe(
      'Card ending in 4242',
    )
    expect(formatPaymentMethod({ paymentRail: 'card', cardBrand: 'maestro', cardLast4: '1234' })).toBe(
      'Maestro ending in 1234',
    )
  })

  it('ignores a charge that is not an expanded object', () => {
    expect(cardDetailsFromCharge(null)).toEqual({ brand: null, last4: null })
    expect(cardDetailsFromCharge('ch_123')).toEqual({ brand: null, last4: null })
    expect(cardDetailsFromCharge({ payment_method_details: { card: { brand: 1, last4: 4 } } })).toEqual({
      brand: null,
      last4: null,
    })
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

  it('treats a string latest_charge as card with no last 4', () => {
    expect(paymentMethodFromIntent('card', { latest_charge: 'ch_123' })).toBe('Card')
    expect(paymentMethodFromIntent(null, null)).toBe('Card')
  })

  it('uses Card when there is no intent to retrieve', async () => {
    await expect(resolvePaymentMethod({ paymentRail: 'card' })).resolves.toBe('Card')
  })

  it('reads the retrieved charge when Stripe answers', async () => {
    await expect(
      resolvePaymentMethod({
        paymentRail: 'card',
        retrieveIntent: async () => ({
          latest_charge: {
            payment_method_details: { card: { brand: 'visa', last4: '4242' } },
          },
        }),
      }),
    ).resolves.toBe('Visa ending in 4242')
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
    expect(lines[0]).toBe('$28 per person x 1 guest')
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
    expect(lines[0]).toBe('$24 per person x 4 guests')
    expect(lines).toContain('Group discount (15%)')
    expect(lines.join('\n')).not.toMatch(/−\$16|booking fee|platform fee/i)
  })

  it('uses the booking card total per guest, not the 1-guest all-in price', () => {
    const lines = receiptPriceLines({
      pricePerPersonCents: 100,
      guestsCount: 2,
      groupPricing: true,
      paymentRail: 'paynow',
      totalPaidCents: 475,
    })
    expect(lines[0]).toBe('$2.50 per person x 2 guests')
    expect(lines).toContain('PayNow saving $0.25')
    expect(lines.at(-1)).toBe('Total paid $4.75')
    expect(lines.join('\n')).not.toMatch(/group discount/i)
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

  it('treats a missing guest count as one person', () => {
    const lines = receiptPriceLines({
      pricePerPersonCents: 2500,
      guestsCount: Number.NaN,
      paymentRail: 'card',
      totalPaidCents: 2800,
    })
    expect(lines[0]).toBe('$28 per person x 1 guest')
  })
})

describe('refundDeadlineLines', () => {
  it('turns the 48 / 24 / 6 hour cutoffs into Singapore dates', () => {
    const lines = refundDeadlineLines(SESSION_STARTS)
    expect(lines[0]).toBe(`Full refund if you cancel before ${formatSessionDate('2026-08-26T11:00:00.000Z')}`)
    expect(lines[1]).toBe(`50% refund if you cancel before ${formatSessionDate('2026-08-27T11:00:00.000Z')}`)
    expect(lines[2]).toBe(`25% refund if you cancel before ${formatSessionDate('2026-08-28T05:00:00.000Z')}`)
    expect(refundDeadlineLines('not-a-date')).toEqual([])
  })
})

describe('guest count and session day', () => {
  it('pluralises 1 guest and N guests', () => {
    expect(guestCountLabel(1)).toBe('1 guest')
    expect(guestCountLabel(2)).toBe('2 guests')
    expect(guestCountLabel(0)).toBe('1 guest')
  })

  it('formats the weekday-first Singapore day used in the subject', () => {
    expect(formatSessionDay(SESSION_STARTS)).toBe('Fri, 28 Aug')
    expect(formatSessionDay('not-a-date')).toBe('')
  })

  it('builds the guest confirmation subject with one exclamation mark', () => {
    expect(bookingConfirmedGuestSubject('Latte art', SESSION_STARTS)).toBe(
      "You're in! Latte art on Fri, 28 Aug",
    )
    expect(bookingConfirmedGuestSubject('Latte art', 'bad')).toBe("You're in! Latte art")
    expect((bookingConfirmedGuestSubject('Latte art', SESSION_STARTS).match(/!/g) ?? []).length).toBe(1)
  })
})

describe('googleCalendarUrl', () => {
  it('uses title, UTC start and end, and the address', () => {
    const url = googleCalendarUrl({
      title: 'Latte art',
      startsAt: SESSION_STARTS,
      durationMins: 90,
      address: '12 Club Street, Singapore 069410',
    })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE')
    expect(parsed.searchParams.get('text')).toBe('Latte art')
    expect(parsed.searchParams.get('dates')).toBe('20260828T110000Z/20260828T123000Z')
    expect(parsed.searchParams.get('location')).toBe('12 Club Street, Singapore 069410')
  })

  it('defaults to one hour and a generic title when those are missing', () => {
    const url = googleCalendarUrl({ title: '', startsAt: SESSION_STARTS })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('text')).toBe('TryKai session')
    expect(parsed.searchParams.get('dates')).toBe('20260828T110000Z/20260828T120000Z')
    expect(parsed.searchParams.get('location')).toBeNull()
  })

  it('returns empty when the start is not a date', () => {
    expect(googleCalendarUrl({ title: 'Latte art', startsAt: 'nope' })).toBe('')
  })
})

describe('refund timing copy', () => {
  it('shows only the line for the method used', () => {
    expect(refundTimingCopy('card')).toBe(
      'Card refunds usually take 5 to 10 business days to appear.',
    )
    expect(refundTimingCopy('paynow')).toBe(
      'PayNow refunds are usually faster than card refunds.',
    )
    expect(refundTimingCopy()).toBe(
      'Card refunds usually take 5 to 10 business days to appear.',
    )
    expect(refundMethodNoun('paynow')).toBe('PayNow')
    expect(refundMethodNoun('card')).toBe('card')
  })

  it('puts the refund amount on a guest-cancel subject only when there is one', () => {
    expect(
      bookingCancelledGuestSubject({
        cancelledBy: 'guest',
        listingTitle: 'Latte art',
        refundAmountCents: 5100,
      }),
    ).toBe('Booking cancelled: Latte art · $51 refund')
    expect(
      bookingCancelledGuestSubject({
        cancelledBy: 'guest',
        listingTitle: 'Latte art',
        refundAmountCents: 0,
      }),
    ).toBe('Booking cancelled: Latte art')
    expect(
      bookingCancelledGuestSubject({
        cancelledBy: 'host',
        listingTitle: 'Latte art',
        refundAmountCents: 5100,
        hostName: 'Mei Ling',
      }),
    ).toBe('Mei Ling had to cancel Latte art')
  })

  it('phrases host-facing guest counts without amounts', () => {
    expect(hostRefundedGuestsLine(1)).toBe('Your guest has been refunded in full.')
    expect(hostRefundedGuestsLine(2)).toBe('Both guests have been refunded in full.')
    expect(hostRefundedGuestsLine(4)).toBe('All 4 guests have been refunded in full.')
    expect(hostRefundedGuestsLine(Number.NaN)).toBe('Your guest has been refunded in full.')
  })
})

describe('booking confirmation emails', () => {
  it('is a guest receipt: greeting, host opening, reference, details, calendar, quiet policy', () => {
    const html = guestReceipt()
    expect(html).toContain('Hi caleb2,')
    expect(html).toContain("You're booked with Mei Ling. Here's everything you need.")
    expect(html).toContain('Booking reference:</strong> A1B2C3D4')
    expect(html).toContain(formatSessionDate(SESSION_STARTS))
    expect(html).toContain('1 hr 30 min')
    expect(html).toContain('12 Club Street, Singapore 069410')
    expect(html).toContain('Guests:</strong> 4 guests')
    expect(html).toContain("What's provided:</strong> Apron, Coffee beans")
    expect(html).toContain('$24 per person x 4 guests')
    expect(html).toContain('Group discount (15%)')
    expect(html).not.toContain('−$16')
    expect(html).toContain('PayNow saving $4.80')
    expect(html).toContain('Total paid $91.20')
    expect(html).toContain('Payment method:</strong> PayNow')
    expect(html).toContain('Your bank will show this payment as Stripe Payments Singapore.')
    expect(html).not.toMatch(/booking fee|platform fee/i)
    expect(html).not.toMatch(/Full refund if you cancel/)
    expect(html).not.toMatch(/50% refund if you cancel/)
    expect(html).not.toMatch(/25% refund if you cancel/)
    expect(html).toContain('Need to change plans?')
    expect(html).toContain('href="https://trykai.sg/cancellation-policy"')
    expect(html).toContain('Cancellation policy')
    expect(html).toContain('Add to Google Calendar')
    expect(html).toContain('dates=20260828T110000Z/20260828T123000Z')
    expect(html.replace('<!DOCTYPE html>', '')).not.toContain('!')
    expect(html).toContain('href="https://trykai.sg/bookings/booking-1"')
    expect(html).toContain('View booking')
    expect(html).toContain('Questions for your host? Reply to this email.')
    expect(html).toContain('Browse more experiences')
    expect(html).toContain('See you there,')
    expect(html).toContain('The TryKai team')
    expect(html.match(/href="https:\/\/trykai\.sg"/g)?.length).toBe(1)
    expect(html).toContain('TryKai')
    expect(html).toContain('UEN 53526159D')
    expect(html).toContain('https://trykai.sg/terms')
    expect(html).toContain('https://trykai.sg/privacy')
    expect(html).not.toContain('/dashboard')
  })

  it('omits duration, address, What\'s provided, and a missing host name', () => {
    const html = guestReceipt({
      hostName: '',
      duration: '',
      fullAddress: '',
      whatsProvided: [],
    })
    expect(html).toContain("You're booked with your host. Here's everything you need.")
    expect(html).not.toContain('Duration:')
    expect(html).not.toContain('Address:')
    expect(html).not.toContain("What's provided:")
  })

  it('skips What\'s provided when the only item is None', () => {
    expect(guestReceipt({ whatsProvided: ['None'] })).not.toContain("What's provided:")
    expect(guestReceipt({ whatsProvided: null })).not.toContain("What's provided:")
  })

  it('names the card brand and last 4 when the guest paid by card', () => {
    const html = guestReceipt({
      guestsCount: 1,
      paymentRail: 'card',
      totalPaidCents: 2800,
      paymentMethod: 'Visa ending in 4242',
    })
    expect(html).toContain('Guests:</strong> 1 guest')
    expect(html).toContain('$28 per person x 1 guest')
    expect(html).toContain('Total paid $28')
    expect(html).toContain('Visa ending in 4242')
    expect(html).not.toMatch(/group discount/i)
    expect(html).not.toMatch(/PayNow saving/)
    expect(html).not.toMatch(/booking fee|platform fee/i)
    expect(html).not.toContain('Stripe Payments Singapore')
  })

  it('escapes listing copy a host typed', () => {
    const html = guestReceipt({
      listingTitle: '<script>x</script>',
      hostName: '<b>Mei</b>',
      fullAddress: '<img src=x>',
      whatsProvided: ['<svg>'],
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('%3Cscript%3E')
    expect(html).toContain('&lt;b&gt;Mei&lt;/b&gt;')
    expect(html).toContain('&lt;svg&gt;')
  })

  it('falls back to Hi, when the guest has no display name', () => {
    expect(guestReceipt({ guestName: '' })).toContain('Hi,')
    expect(guestReceipt({ guestName: '  ' })).toContain('Hi,')
  })

  it('omits the calendar link when the session start is missing', () => {
    const html = guestReceipt({ sessionStartsAt: '' })
    expect(html).not.toContain('Add to Google Calendar')
  })

  it('tells the host the reference, guest display name, and payout after any host fee', () => {
    const html = bookingConfirmedHostHtml({
      bookingReference: 'A1B2C3D4',
      hostName: 'Mei Ling',
      guestName: 'Sarah',
      listingTitle: 'Latte art',
      sessionDate: formatSessionDate(SESSION_STARTS),
      guestsCount: 1,
      hostPayoutCents: 8500,
    })
    expect(html).toContain('Hi Mei Ling,')
    expect(html).toContain('Booking reference:</strong> A1B2C3D4')
    expect(html).toContain('Sarah')
    expect(html).toContain('Latte art')
    expect(html).toContain(formatSessionDate(SESSION_STARTS))
    expect(html).toContain('Guests:</strong> 1 guest')
    expect(html).toContain("You'll receive $85")
    expect(html).toContain('See you there,')
    expect(html).toContain('The TryKai team')
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

  it('renders a non-number as zero', () => {
    expect(formatCents(Number.NaN)).toBe('$0')
  })

  it('groups thousands the way a guest reads a price', () => {
    expect(formatCents(135800)).toBe('$1,358')
  })
})

describe('cancellation emails', () => {
  it('tells a guest who cancelled that the refund is on its way', () => {
    const html = guestCancelMail()
    expect(html).toContain('Hi caleb2,')
    expect(html).toContain("Sorry you can't make it")
    expect(html).not.toContain("Sorry you can't make Latte art.")
    expect(html).toContain('Your refund of $51 is on its way to your PayNow.')
    expect(html).toContain('PayNow refunds are usually faster than card refunds.')
    expect(html).not.toContain('5 to 10 business days')
    expect(html).toContain('Listing:</strong> Latte art')
    expect(html).toContain('Date and time:</strong> 28 Aug 2026, 7:00 pm')
    expect(html).not.toMatch(/3 to 5 business days|few hours|1 business day/)
    expect(html).toContain('Booking reference:</strong> A1B2C3D4')
    expect(html).toContain('Guests:</strong> 2 guests')
    expect(html).toContain('Find another time with Mei Ling')
    expect(html).toContain('href="https://trykai.sg/listings/listing-1"')
    expect(html).toContain('Browse other experiences')
    expect(html).toContain('Take care,')
    expect(html).toContain('The TryKai team')
    expect(html).toContain('UEN 53526159D')
    expect(html.replace('<!DOCTYPE html>', '')).not.toContain('!')
  })

  it('says there is no refund when the guest cancelled at $0', () => {
    const html = guestCancelMail({ refundAmountCents: 0, guestsCount: 1 })
    expect(html).toContain("Sorry you can't make it")
    expect(html).toContain("There's no refund for this cancellation.")
    expect(html).toContain('Date and time:</strong> 28 Aug 2026, 7:00 pm')
    expect(html).toContain('Guests:</strong> 1 guest')
    expect(html).not.toContain('on its way')
    expect(html).not.toContain('5 to 10 business days')
    expect(html).not.toContain('usually faster')
  })

  it('uses the card timing line when the guest paid by card', () => {
    const html = guestCancelMail({ paymentRail: 'card', paymentMethod: 'Visa ending in 4242' })
    expect(html).toContain('on its way to your card.')
    expect(html).toContain('Card refunds usually take 5 to 10 business days to appear.')
    expect(html).not.toContain('PayNow refunds are usually faster')
    expect(html).not.toMatch(/3 to 5 business days|few hours|1 business day/)
  })

  it('tells a guest the host cancelled, with a full refund and other sessions', () => {
    const html = hostCancelGuestMail()
    expect(html).toContain('Hi caleb2,')
    expect(html).toContain("We're sorry. Mei Ling had to cancel your session on 28 Aug 2026, 7:00 pm.")
    expect(html).toContain("You'll get a full refund of $51.")
    expect(html).toContain('Card refunds usually take 5 to 10 business days to appear.')
    expect(html).not.toContain('PayNow refunds are usually faster')
    expect(html).toContain('Date and time:</strong> 28 Aug 2026, 7:00 pm')
    expect(html).toContain("See Mei Ling&#39;s other sessions")
    expect(html).toContain('href="https://trykai.sg/listings/listing-1"')
    expect(html).toContain('Browse other experiences')
    expect(html).toContain('Take care,')
    expect(html).not.toContain('Find something similar')
  })

  it('points at a category browse when the host has no other sessions', () => {
    const html = hostCancelGuestMail({ hasOtherSessions: false })
    expect(html).toContain('Find something similar')
    expect(html).toContain('href="https://trykai.sg/?category=Food"')
    expect(html).not.toContain('other sessions')
  })

  it('escapes listing titles that a host typed', () => {
    const html = guestCancelMail({ listingTitle: '<script>x</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('tells the host what they will receive, never the guest refund', () => {
    const kept = bookingCancelledHostHtml({
      bookingReference: 'A1B2C3D4',
      hostName: 'Mei Ling',
      guestName: 'Sarah',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestsCount: 3,
      hostPayoutCents: 4250,
    })
    expect(kept).toContain('Hi Mei Ling,')
    expect(kept).toContain('Booking reference:</strong> A1B2C3D4')
    expect(kept).toContain('Sarah')
    expect(kept).toContain('Latte art')
    expect(kept).toContain('Guests:</strong> 3 guests')
    expect(kept).toContain("You'll receive $42.50")
    expect(kept).toContain('Take care,')
    expect(kept).not.toMatch(/Refund amount|Refund method|Total paid|PayNow|ending in/i)

    const none = bookingCancelledHostHtml({
      bookingReference: 'A1B2C3D4',
      guestName: 'Sarah',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestsCount: 1,
      hostPayoutCents: 0,
    })
    expect(none).toContain('Guests:</strong> 1 guest')
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
      guestName: 'caleb2',
      hostName: 'Mei Ling',
      listingId: 'listing-1',
      listingCategory: 'Food',
      hasOtherSessions: false,
      paymentRail: 'card',
      guestsCount: 2,
      paymentMethod: 'Visa ending in 4242',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      from: 'TryKai <no-reply@trykai.sg>',
      to: 'guest@trykai.sg',
      subject: 'Mei Ling had to cancel Latte art',
      reply_to: 'hello@trykai.sg',
    })
    const hostCancelHtml = JSON.parse(fetchMock.mock.calls[0][1].body).html
    expect(hostCancelHtml).toContain('$51')
    expect(hostCancelHtml).toContain('A1B2C3D4')
    expect(hostCancelHtml).toContain('Find something similar')

    fetchMock.mockClear()

    await sendCancellationEmails({
      apiKey: 're_test',
      cancelledBy: 'host',
      refundAmountCents: 5100,
      bookingReference: 'A1B2C3D4',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestEmail: 'guest@trykai.sg',
      hostEmail: 'host@trykai.sg',
      guestsCount: 1,
      paymentMethod: 'Card',
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).subject).toBe(
      'Your host had to cancel Latte art',
    )

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
      guestName: 'caleb2',
      hostName: 'Mei Ling',
      listingId: 'listing-1',
      paymentRail: 'paynow',
      guestsCount: 2,
      paymentMethod: 'PayNow',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      to: 'guest@trykai.sg',
      subject: 'Booking cancelled: Latte art',
      reply_to: 'hello@trykai.sg',
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).toContain("Sorry you can't make it")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).toContain(
      "There's no refund for this cancellation.",
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      to: 'host@trykai.sg',
      subject: 'A guest cancelled "Latte art"',
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('reply_to')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).html).toContain('A1B2C3D4')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).html).toContain(
      "You won't receive a payout for this booking",
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).html).not.toMatch(/Refund amount|PayNow/)

    fetchMock.mockClear()

    await sendCancellationEmails({
      apiKey: 're_test',
      cancelledBy: 'guest',
      refundAmountCents: 5100,
      bookingReference: 'A1B2C3D4',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestEmail: 'guest@trykai.sg',
      hostEmail: 'host@trykai.sg',
      guestName: 'caleb2',
      hostName: 'Mei Ling',
      paymentRail: 'card',
      guestsCount: 1,
      paymentMethod: 'Card',
      hostPayoutCents: 0,
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).subject).toBe(
      'Booking cancelled: Latte art · $51 refund',
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).toContain(
      'Card refunds usually take 5 to 10 business days to appear.',
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).toContain(
      'Date and time:</strong> 28 Aug 2026, 7:00 pm',
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).not.toContain(
      "There's no refund for this cancellation.",
    )
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

describe('host session cancelled email', () => {
  it('tells the host they cancelled, the guest count, and the strike', () => {
    const html = hostSessionCancelMail()
    expect(html).toContain('Hi Mei Ling,')
    expect(html).toContain('You cancelled Latte art on 28 Aug 2026, 7:00 pm.')
    expect(html).toContain('All 3 guests have been refunded in full.')
    expect(html).toContain('This is strike 2 of 3; at 3 your listings are paused.')
    expect(html).toContain('href="https://trykai.sg/cancellation-policy#appeals"')
    expect(html).toContain('Appeal this strike')
    expect(html).toContain('Take care,')
    expect(html).toContain('The TryKai team')
    expect(html).toContain('UEN 53526159D')
    expect(html).not.toMatch(/\$\d|refund of|PayNow|ending in/i)
    expect(html.replace('<!DOCTYPE html>', '')).not.toContain('!')
  })

  it('uses your guest and both guests for one and two', () => {
    expect(hostSessionCancelMail({ guestCount: 1 })).toContain('Your guest has been refunded in full.')
    expect(hostSessionCancelMail({ guestCount: 2 })).toContain('Both guests have been refunded in full.')
  })

  it('sends the host-only strike mail', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendHostSessionCancelledEmail({
      apiKey: 're_test',
      hostEmail: 'host@trykai.sg',
      hostName: 'Mei Ling',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestCount: 3,
      strikeCount: 1,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      from: 'TryKai <no-reply@trykai.sg>',
      to: 'host@trykai.sg',
      subject: 'You cancelled Latte art',
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('reply_to')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).toContain('strike 1 of 3')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).not.toMatch(/\$\d/)
  })
})

describe('dispute refund emails', () => {
  const base = {
    bookingReference: 'A1B2C3D4',
    listingTitle: 'Latte <art>',
    sessionDate: '28 Aug 2026, 7:00 pm',
    refundAmountCents: 1550,
    guestName: 'caleb2',
    siteUrl: 'https://trykai.sg',
  }

  it('is a refund receipt, not a host cancellation', () => {
    const html = disputeRefundGuestHtml({ ...base, fullRefund: false, paymentRail: 'card' })
    expect(html).toContain('Hi caleb2,')
    expect(html).toContain("We've reviewed your report about Latte &lt;art&gt;.")
    expect(html).toContain("We're refunding $15.50 to your card.")
    expect(html).toContain('Card refunds usually take 5 to 10 business days to appear.')
    expect(html).toContain('Booking reference:</strong> A1B2C3D4')
    expect(html).toContain('Date and time:</strong> 28 Aug 2026, 7:00 pm')
    expect(html).not.toMatch(/had to cancel|in full/)
    expect(html.replace('<!DOCTYPE html>', '')).not.toContain('!')
  })

  it('says in full when the dispute cancels the booking', () => {
    const html = disputeRefundGuestHtml({ ...base, fullRefund: true, paymentRail: 'paynow' })
    expect(html).toContain("We've refunded your booking in full. $15.50 is on its way to your PayNow.")
    expect(html).toContain('PayNow refunds are usually faster than card refunds.')
    expect(html).not.toContain('had to cancel')
  })

  it('puts the amount in the subject', () => {
    expect(disputeRefundGuestSubject('Latte art', 2000)).toBe('Your $20 refund for Latte art')
  })

  it('sends to the guest with the TryKai reply-to', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await sendDisputeRefundEmail({
      ...base,
      apiKey: 're_test',
      guestEmail: 'guest@trykai.sg',
      fullRefund: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.to).toBe('guest@trykai.sg')
    expect(body.reply_to).toBe('hello@trykai.sg')
    expect(body.subject).toBe('Your $15.50 refund for Latte <art>')
  })

  it('never throws when the email cannot be built or sent', async () => {
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      sendDisputeRefundEmail({
        ...base,
        apiKey: 're_test',
        guestEmail: 'guest@trykai.sg',
        fullRefund: false,
        listingTitle: null as unknown as string,
      }),
    ).resolves.toBeUndefined()
    expect(errorMock).toHaveBeenCalled()
    errorMock.mockRestore()
  })
})
