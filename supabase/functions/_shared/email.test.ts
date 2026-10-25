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
  complaintOpsHtml,
  complaintReceivedGuestHtml,
  complaintReceivedGuestSubject,
  disputeRefundGuestHtml,
  disputeRefundGuestSubject,
  emailSiteUrl,
  escapeHtml,
  formatCents,
  formatDuration,
  formatPaymentMethod,
  formatReminderSessionDate,
  formatSessionDate,
  formatSessionDay,
  formatSessionTime,
  guestSessionReminderHtml,
  reminderWhen,
  guestSessionReminderSubject,
  googleCalendarUrl,
  hostSessionReminderHtml,
  hostSessionReminderSubject,
  guestCountLabel,
  hostPayoutLine,
  hostRefundedGuestsLine,
  hostSessionCancelledHtml,
  paymentMethodFromIntent,
  publicDisplayName,
  receiptPriceLines,
  receiptRows,
  keenHostHtml,
  keenHostSubject,
  dateOpenedGuestHtml,
  dateOpenedGuestSubject,
  EMAIL_COLORS,
  EMAIL_LOGO_URL,
  refundDeadlineLines,
  refundMethodNoun,
  refundTimingCopy,
  resolvePaymentMethod,
  sendCancellationEmails,
  sendComplaintEmails,
  sendDisputeRefundEmail,
  sendHostSessionCancelledEmail,
  sendResendEmail,
  verificationApprovedHtml,
  verificationRejectedHtml,
  listingApprovedHtml,
  listingApprovedSubject,
  listingChangesHtml,
  listingChangesSubject,
  listingSubmittedOpsHtml,
  listingSubmittedSubject,
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
    expect(verificationApprovedHtml({ hostName: null })).toContain('You&#39;re verified!')
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

/** A label/value row in the details table, ignoring the inline styles. */
function hasDetail(html: string, label: string, value: string): boolean {
  // Leaf cells only: a cell that opens another table is layout, not a detail.
  const cells = [...html.matchAll(/<td[^>]*>((?:(?!<td)[\s\S])*?)<\/td>/g)].map((m) => m[1].trim())
  return cells.some((cell, i) => cell === label && cells[i + 1] === value)
}

/** Receipt rows as [label, amount] pairs. */
function receiptCells(html: string): string[][] {
  const block = html.slice(html.indexOf('>Receipt<'))
  return [...block.matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g)].map(
    (m) => [m[1].trim(), m[2].replace(/<[^>]+>/g, '').trim()],
  )
}

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
    expect(hasDetail(html, 'Booking reference', 'A1B2C3D4')).toBe(true)
    expect(hasDetail(html, 'Date and time', formatSessionDate(SESSION_STARTS))).toBe(true)
    expect(hasDetail(html, 'Duration', '1 hr 30 min')).toBe(true)
    expect(hasDetail(html, 'Address', '12 Club Street, Singapore 069410')).toBe(true)
    expect(hasDetail(html, 'Guests', '4 guests')).toBe(true)
    expect(hasDetail(html, "What&#39;s provided", 'Apron, Coffee beans')).toBe(true)
    expect(receiptCells(html)).toEqual([
      ['$24 per person x 4 guests', '$96'],
      ['Group discount (15%)', 'Included'],
      ['PayNow saving', '−$4.80'],
      ['Total paid', '$91.20'],
    ])
    expect(html).not.toContain('−$16')
    expect(html).toContain('Paid with PayNow')
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
    expect(html).not.toContain('>Duration<')
    expect(html).not.toContain('>Address<')
    expect(html).not.toContain('>What&#39;s provided<')
  })

  it('skips What\'s provided when the only item is None', () => {
    expect(guestReceipt({ whatsProvided: ['None'] })).not.toContain('>What&#39;s provided<')
    expect(guestReceipt({ whatsProvided: null })).not.toContain('>What&#39;s provided<')
  })

  it('adds What to bring when the listing has items, and omits it when empty', () => {
    expect(hasDetail(guestReceipt({ whatToBring: ['Water bottle', 'Apron'] }), 'What to bring', 'Water bottle, Apron')).toBe(
      true,
    )
    expect(guestReceipt({ whatToBring: [] })).not.toContain('>What to bring<')
    expect(guestReceipt()).not.toContain('>What to bring<')
  })

  it('names the card brand and last 4 when the guest paid by card', () => {
    const html = guestReceipt({
      guestsCount: 1,
      paymentRail: 'card',
      totalPaidCents: 2800,
      paymentMethod: 'Visa ending in 4242',
    })
    expect(hasDetail(html, 'Guests', '1 guest')).toBe(true)
    expect(receiptCells(html)).toEqual([
      ['$28 per person x 1 guest', '$28'],
      ['Total paid', '$28'],
    ])
    expect(html).toContain('Paid with Visa ending in 4242')
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

describe('complaint emails', () => {
  const ops = {
    bookingId: 'a1b2c3d4-0000',
    bookingReference: 'A1B2C3D4',
    listingTitle: 'Latte art',
    sessionDate: '28 Aug 2026, 7:00 pm',
    guestName: 'caleb2',
    guestEmail: 'guest@trykai.sg',
    description: 'Host was <b>late</b> by 40 minutes',
    photoPaths: ['a1b2c3d4-0000/c-1/1.jpg'],
    photoFailures: 0,
    payoutHeld: true,
  }

  it('acknowledges the guest and promises a reply in 2 business days', () => {
    const html = complaintReceivedGuestHtml({
      bookingReference: 'A1B2C3D4',
      listingTitle: 'Latte <art>',
      sessionDate: '28 Aug 2026, 7:00 pm',
      guestName: 'caleb2',
    })
    expect(html).toContain('Hi caleb2,')
    expect(html).toContain('Thanks for telling us what happened at Latte &lt;art&gt;.')
    expect(html).toContain('reply by email within 2 business days')
    expect(html).toContain('Booking reference:</strong> A1B2C3D4')
    expect(html).toContain('href="https://trykai.sg/dispute-policy"')
    expect(html.replace('<!DOCTYPE html>', '')).not.toContain('!')
    expect(complaintReceivedGuestSubject('Latte art')).toBe(
      "We've received your report about Latte art",
    )
  })

  it('gives ops the escaped report, photos and hold state', () => {
    const html = complaintOpsHtml(ops)
    expect(html).toContain('Guest reported a problem: A1B2C3D4')
    expect(html).toContain('Host was &lt;b&gt;late&lt;/b&gt;')
    expect(html).not.toContain('<b>late</b>')
    expect(html).toContain('1 in Storage bucket complaint-evidence: a1b2c3d4-0000/c-1/1.jpg')
    expect(html).toContain('Held automatically')
    expect(html).not.toContain('upload(s) failed')
  })

  it('tells ops when photos failed or the payout was not held', () => {
    const html = complaintOpsHtml({ ...ops, photoPaths: [], photoFailures: 2, payoutHeld: false })
    expect(html).toContain('<strong>Photos:</strong> None')
    expect(html).toContain('2 photo upload(s) failed')
    expect(html).toContain('<strong>Not held.</strong>')
  })

  it('emails ops (reply-to the guest) and then the guest', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await sendComplaintEmails({
      apiKey: 're_test',
      opsEmail: 'ops@trykai.sg',
      guestEmail: 'guest@trykai.sg',
      guestName: 'caleb2',
      bookingId: 'a1b2c3d4-0000',
      listingTitle: 'Latte art',
      sessionDate: '28 Aug 2026, 7:00 pm',
      description: 'Host was late by 40 minutes',
      photoPaths: [],
      photoFailures: 0,
      payoutHeld: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const first = JSON.parse(fetchMock.mock.calls[0][1].body)
    const second = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(first.to).toBe('ops@trykai.sg')
    expect(first.reply_to).toBe('guest@trykai.sg')
    expect(first.subject).toBe('Guest reported a problem: A1B2C3D4 Latte art')
    expect(second.to).toBe('guest@trykai.sg')
    expect(second.reply_to).toBe('hello@trykai.sg')
  })

  it('falls back on missing guest details and never throws', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendComplaintEmails({
      apiKey: 're_test',
      opsEmail: 'ops@trykai.sg',
      guestEmail: null,
      bookingId: 'a1b2c3d4-0000',
      listingTitle: 'Latte art',
      sessionDate: '',
      description: 'Host was late by 40 minutes',
      photoPaths: [],
      photoFailures: 0,
      payoutHeld: false,
    })
    const first = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(first.reply_to).toBeUndefined()
    expect(first.html).toContain('Guest (unknown email)')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await expect(
      sendComplaintEmails({
        apiKey: 're_test',
        opsEmail: 'ops@trykai.sg',
        guestEmail: 'guest@trykai.sg',
        bookingId: 'a1b2c3d4-0000',
        listingTitle: 'Latte art',
        sessionDate: '',
        description: null as unknown as string,
        photoPaths: [],
        photoFailures: 0,
        payoutHeld: false,
      }),
    ).resolves.toBeUndefined()
    expect(errorMock).toHaveBeenCalled()
    errorMock.mockRestore()
  })
})

describe('branded receipt', () => {
  it('shows only the total when the rows would not add up to what was paid', () => {
    const html = guestReceipt({ totalPaidCents: 9999 })
    expect(receiptCells(html)).toEqual([['Total paid', '$99.99']])
    expect(html).not.toContain('per person x')
  })

  it('reports whether the receipt rows add up', () => {
    const base = { pricePerPersonCents: 2500, guestsCount: 4, groupPricing: true }
    expect(receiptRows({ ...base, paymentRail: 'card', totalPaidCents: 9600 }).addsUp).toBe(true)
    expect(receiptRows({ ...base, paymentRail: 'paynow', totalPaidCents: 9120 }).addsUp).toBe(true)
    expect(receiptRows({ ...base, paymentRail: 'card', totalPaidCents: 9120 }).addsUp).toBe(false)
    const { rows } = receiptRows({ ...base, paymentRail: 'paynow', totalPaidCents: 9120 })
    const sum = rows.reduce((total, row) => total + (row.amountCents ?? 0), 0)
    expect(sum).toBe(9120)
  })

  it('has the brand frame: production logo, wordmark, cream page, inbox preview', () => {
    const html = guestReceipt({ siteUrl: 'https://trykai.vercel.app' })
    expect(html).toContain(`src="${EMAIL_LOGO_URL}"`)
    expect(EMAIL_LOGO_URL).toBe('https://trykai.sg/trykai.png')
    expect(html).toContain(`TryKai<span style="color:${EMAIL_COLORS.coral};">.</span>`)
    expect(html).toContain(`background:${EMAIL_COLORS.cream}`)
    expect(html).toContain('<meta name="color-scheme" content="light">')
    expect(html).toMatch(/display:none[^>]*>Latte art · .* · Ref A1B2C3D4/)
    // Links follow the environment; only the logo is pinned to production.
    expect(html).toContain('href="https://trykai.vercel.app/bookings/booking-1"')
  })

  it('puts the listing title in the heading, escaped', () => {
    expect(guestReceipt()).toMatch(/<h1[^>]*>Latte art<\/h1>/)
    expect(guestReceipt({ listingTitle: 'Tea & <b>' })).toMatch(/<h1[^>]*>Tea &amp; &lt;b&gt;<\/h1>/)
  })

  it('never uses coral for text or buttons', () => {
    const html = guestReceipt()
    const coralUses = html.match(new RegExp(EMAIL_COLORS.coral, 'g')) ?? []
    expect(coralUses).toHaveLength(1)
    expect(html).toContain(`background:${EMAIL_COLORS.navy};border-radius:12px;`)
  })

  it('wraps every email in the same frame', () => {
    const emails = [
      verificationApprovedHtml({ hostName: 'Mei' }),
      verificationRejectedHtml({ hostName: 'Mei', reason: 'blurry' }),
      bookingConfirmedHostHtml({
        bookingReference: 'A1B2C3D4',
        guestName: 'Sarah',
        listingTitle: 'Latte art',
        sessionDate: 'x',
        guestsCount: 1,
        hostPayoutCents: 2500,
      }),
    ]
    for (const html of emails) {
      expect(html).toContain(`src="${EMAIL_LOGO_URL}"`)
      expect(html).toContain('UEN 53526159D')
      expect(html).not.toMatch(/#111|#666|#f4f4f5/)
    }
  })

  it('escapes the host name in the approval email', () => {
    const html = verificationApprovedHtml({ hostName: '<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('I\'m keen emails', () => {
  const summary = {
    keen_count: 3,
    weekday: 1,
    weekend: 2,
    morning: 0,
    afternoon: 0,
    evening: 3,
    min_group: 1,
    max_group: 4,
  }

  it('tells the host counts and tallies, never who', () => {
    expect(keenHostSubject('Latte art', 3)).toBe('3 people are keen on Latte art')
    expect(keenHostSubject('Latte art', 1)).toBe('Someone is keen on Latte art')
    const html = keenHostHtml({ hostName: 'Mei Ling', listingTitle: 'Latte art', summary, siteUrl: 'https://trykai.sg' })
    expect(html).toContain('Hi Mei Ling,')
    expect(hasDetail(html, 'Days', 'Weekends 2 · Weekdays 1')).toBe(true)
    expect(hasDetail(html, 'Times', 'Evening 3')).toBe(true)
    expect(hasDetail(html, 'Group size', 'Groups of 1 to 4')).toBe(true)
    expect(html).toContain('href="https://trykai.sg/hosting"')
    expect(html).toContain('Add dates')
    expect(html).toContain(`src="${EMAIL_LOGO_URL}"`)
  })

  it('leaves out tallies nobody picked and escapes the title', () => {
    const html = keenHostHtml({
      listingTitle: '<b>Tea</b>',
      summary: { ...summary, keen_count: 1, weekday: 0, weekend: 0, evening: 0, min_group: null, max_group: null },
    })
    expect(html).toContain('Someone tapped')
    expect(html).not.toContain('>Days<')
    expect(html).not.toContain('>Group size<')
    expect(html).not.toContain('<b>Tea</b>')
    expect(html).toContain('&lt;b&gt;Tea&lt;/b&gt;')
  })

  it('tells a keen guest the next dates, once', () => {
    expect(dateOpenedGuestSubject('Mei Ling', 'Latte art')).toBe('Mei Ling just opened a date for Latte art')
    expect(dateOpenedGuestSubject('', 'Latte art')).toBe('Your host just opened a date for Latte art')
    const html = dateOpenedGuestHtml({
      guestName: 'Sam',
      hostName: 'Mei Ling',
      listingTitle: 'Latte art',
      listingId: 'listing-1',
      sessionDates: ['25 Oct 2026, 2:00 pm', '26 Oct 2026, 2:00 pm', '1 Nov 2026, 10:00 am', '2 Nov 2026, 10:00 am'],
      siteUrl: 'https://trykai.sg',
    })
    expect(html).toContain('Hi Sam,')
    expect(html).toContain('25 Oct 2026, 2:00 pm')
    expect(html).toContain('1 Nov 2026, 10:00 am')
    expect(html).not.toContain('2 Nov 2026, 10:00 am')
    expect(html).toContain('and 1 more.')
    expect(html).toContain('href="https://trykai.sg/listings/listing-1"')
    expect(html).toContain('We only send it once.')
  })

  it('omits the date list and "more" line when there are no dates', () => {
    const html = dateOpenedGuestHtml({ listingTitle: 'Latte art', listingId: 'l', sessionDates: [] })
    expect(html).not.toContain('<ul')
    expect(html).not.toContain('more.')
    expect(html).toContain('Your host just opened')
  })
})

describe('listing review emails', () => {
  const submitted = {
    siteUrl: 'https://trykai.sg/',
    listingId: 'listing-1',
    title: 'Latte <art>',
    description: 'Pour hearts',
    category: 'Food',
    area: 'Tiong Bahru',
    priceCents: 4500,
    photoCount: 3,
    hostName: 'Mei Ling',
    hostEmail: 'mei@example.com',
    verifiedName: 'TAN MEI LING',
    verificationMethod: 'singpass',
    resubmitted: false,
  }

  it('tells the team what is waiting, escaped, with a link to the queue', () => {
    const html = listingSubmittedOpsHtml(submitted)
    expect(html).toContain('Latte &lt;art&gt;')
    expect(html).toContain('Singpass: TAN MEI LING')
    expect(html).toContain('S$45 per person')
    expect(html).toContain('https://trykai.sg/admin/listings')
    expect(html).toContain('A new listing needs a look')
    expect(listingSubmittedSubject('Latte', false)).toBe('New listing to review: Latte')
    expect(listingSubmittedOpsHtml({ ...submitted, whatToBring: ['Water bottle'] })).toContain(
      'Water bottle',
    )
    expect(listingSubmittedOpsHtml(submitted)).not.toContain('>What to bring<')
  })

  it('marks a fixed listing as an update, and copes with missing details', () => {
    const html = listingSubmittedOpsHtml({
      ...submitted,
      resubmitted: true,
      priceCents: null,
      description: null,
      category: null,
      area: null,
      verificationMethod: 'manual',
    })
    expect(html).toContain('A listing was updated for review')
    expect(html).toContain('No price')
    expect(html).not.toContain('Singpass:')
    expect(listingSubmittedSubject('Latte', true)).toBe('Listing updated for review: Latte')
  })

  it('tells the host their listing is live, with a link to it', () => {
    const html = listingApprovedHtml({ siteUrl: 'https://trykai.sg', hostName: 'Mei', listingId: 'listing-1', title: 'Latte' })
    expect(html).toContain('https://trykai.sg/listings/listing-1')
    expect(html).toContain('Mei')
    expect(listingApprovedSubject('Latte')).toBe('Latte is live on TryKai')
  })

  it("gives the host the reviewer's note and a link to edit", () => {
    const html = listingChangesHtml({
      siteUrl: 'https://trykai.sg',
      hostName: null,
      listingId: 'listing-1',
      title: 'Latte',
      note: 'Add a <photo>',
    })
    expect(html).toContain('Add a &lt;photo&gt;')
    expect(html).toContain('https://trykai.sg/edit-listing/listing-1')
    expect(listingChangesSubject('Latte')).toBe('One thing to fix on Latte')
  })
})

describe('session reminder emails', () => {
  // 25 Oct 2026 20:00 SGT / 13:00 SGT the same day.
  const SAME_DAY_START = '2026-10-25T12:00:00.000Z'
  const SAME_DAY_SENT = '2026-10-25T05:00:00.000Z'
  // 25 Oct 2026 09:00 SGT, sent 24 Oct 10:00 SGT.
  const NEXT_DAY_START = '2026-10-25T01:00:00.000Z'
  const NEXT_DAY_SENT = '2026-10-24T02:00:00.000Z'
  // Just after midnight SGT on 25 Oct.
  const AFTER_MIDNIGHT = '2026-10-24T16:05:00.000Z'
  const EVENING_BEFORE = '2026-10-24T15:00:00.000Z'
  const JUST_AFTER_MIDNIGHT_SENT = '2026-10-24T16:10:00.000Z'

  it('says Today when the session is later the same Singapore day', () => {
    expect(reminderWhen(SAME_DAY_START, SAME_DAY_SENT)).toBe('Today')
    expect(guestSessionReminderSubject('Latte art', SAME_DAY_START, SAME_DAY_SENT)).toBe(
      `Today: Latte art at ${formatSessionTime(SAME_DAY_START)} 🎉`,
    )
    expect(hostSessionReminderSubject('Latte art', 2, SAME_DAY_START, SAME_DAY_SENT)).toBe(
      'Today: 2 people coming to Latte art 🙌',
    )
    const guest = guestSessionReminderHtml({
      guestName: 'Sam',
      listingTitle: 'Latte art',
      sessionDate: formatReminderSessionDate(SAME_DAY_START),
      startsAt: SAME_DAY_START,
      sentAt: SAME_DAY_SENT,
      hostName: 'Mei',
      bookingId: 'booking-1',
    })
    expect(guest).toContain('Your session is Today!')
    const host = hostSessionReminderHtml({
      hostName: 'Mei',
      listingTitle: 'Latte art',
      sessionDate: formatReminderSessionDate(SAME_DAY_START),
      startsAt: SAME_DAY_START,
      sentAt: SAME_DAY_SENT,
      guests: [{ name: 'Sam', guestsCount: 2 }],
      totalGuests: 2,
    })
    expect(host).toContain('Your session is Today, and 2 people are coming.')
  })

  it('says Tomorrow when the session is the next Singapore morning', () => {
    expect(reminderWhen(NEXT_DAY_START, NEXT_DAY_SENT)).toBe('Tomorrow')
    expect(guestSessionReminderSubject('Latte art', NEXT_DAY_START, NEXT_DAY_SENT)).toBe(
      `Tomorrow: Latte art at ${formatSessionTime(NEXT_DAY_START)} 🎉`,
    )
    const html = guestSessionReminderHtml({
      guestName: 'Sam',
      listingTitle: 'Latte art',
      sessionDate: formatReminderSessionDate(NEXT_DAY_START),
      startsAt: NEXT_DAY_START,
      sentAt: NEXT_DAY_SENT,
      hostName: 'Mei',
      bookingId: 'booking-1',
    })
    expect(html).toContain('Your session is Tomorrow!')
    expect(html).toContain('Hi Sam!')
  })

  it('treats a session just after midnight SGT as Today only after midnight', () => {
    expect(reminderWhen(AFTER_MIDNIGHT, EVENING_BEFORE)).toBe('Tomorrow')
    expect(reminderWhen(AFTER_MIDNIGHT, JUST_AFTER_MIDNIGHT_SENT)).toBe('Today')
    expect(guestSessionReminderSubject('Latte art', AFTER_MIDNIGHT, EVENING_BEFORE)).toMatch(
      /^Tomorrow:/,
    )
    expect(guestSessionReminderSubject('Latte art', AFTER_MIDNIGHT, JUST_AFTER_MIDNIGHT_SENT)).toMatch(
      /^Today:/,
    )
  })

  it('puts the weekday on the day-and-time line', () => {
    const line = formatReminderSessionDate(SAME_DAY_START)
    expect(line).toBe(`Sun ${formatSessionDate(SAME_DAY_START)}`)
    expect(line).toMatch(/^Sun 25 Oct 2026/)
    expect(line).toMatch(/8:00/i)
  })

  it('uses person or people in the host subject and opening', () => {
    expect(hostSessionReminderSubject('Latte art', 1, NEXT_DAY_START, NEXT_DAY_SENT)).toBe(
      'Tomorrow: 1 person coming to Latte art 🙌',
    )
    expect(hostSessionReminderSubject('Latte art', 3, NEXT_DAY_START, NEXT_DAY_SENT)).toBe(
      'Tomorrow: 3 people coming to Latte art 🙌',
    )
    expect(
      hostSessionReminderHtml({
        listingTitle: 'Latte art',
        sessionDate: 'Sun 25 Oct 2026, 9:00 am',
        startsAt: NEXT_DAY_START,
        sentAt: NEXT_DAY_SENT,
        guests: [{ name: 'Sam', guestsCount: 1 }],
        totalGuests: 1,
      }),
    ).toContain('1 person is coming')
    expect(
      hostSessionReminderHtml({
        listingTitle: 'Latte art',
        sessionDate: 'Sun 25 Oct 2026, 9:00 am',
        startsAt: NEXT_DAY_START,
        sentAt: NEXT_DAY_SENT,
        guests: [
          { name: 'Sam', guestsCount: 2 },
          { name: 'Alex', guestsCount: 1 },
        ],
        totalGuests: 3,
      }),
    ).toContain('3 people are coming')
  })

  it('hides the Total row when there is only one booking', () => {
    const single = hostSessionReminderHtml({
      hostName: 'Mei',
      listingTitle: 'Latte art',
      sessionDate: formatReminderSessionDate(NEXT_DAY_START),
      startsAt: NEXT_DAY_START,
      sentAt: NEXT_DAY_SENT,
      guests: [{ name: 'Sam', guestsCount: 2 }],
      totalGuests: 2,
    })
    expect(single).toContain('Sam · 2 guests')
    expect(single).not.toContain('>Total<')

    const many = hostSessionReminderHtml({
      hostName: 'Mei',
      listingTitle: 'Latte art',
      sessionDate: formatReminderSessionDate(NEXT_DAY_START),
      startsAt: NEXT_DAY_START,
      sentAt: NEXT_DAY_SENT,
      guests: [
        { name: 'Sam', guestsCount: 2 },
        { name: 'Alex', guestsCount: 1 },
      ],
      totalGuests: 3,
    })
    expect(hasDetail(many, 'Total', '3 people')).toBe(true)
  })

  it('lists What to bring after the detail rows, and omits it when empty', () => {
    const withItems = guestSessionReminderHtml({
      guestName: 'Sam',
      listingTitle: 'Latte art',
      sessionDate: formatReminderSessionDate(NEXT_DAY_START),
      startsAt: NEXT_DAY_START,
      sentAt: NEXT_DAY_SENT,
      whatToBring: ['Water bottle', 'Notebook and pen'],
      hostName: 'Mei',
      bookingId: 'booking-1',
    })
    expect(hasDetail(withItems, 'Don&#39;t forget to bring', 'Water bottle, Notebook and pen')).toBe(
      true,
    )
    const without = guestSessionReminderHtml({
      guestName: 'Sam',
      listingTitle: 'Latte art',
      sessionDate: formatReminderSessionDate(NEXT_DAY_START),
      startsAt: NEXT_DAY_START,
      sentAt: NEXT_DAY_SENT,
      whatToBring: [],
      hostName: 'Mei',
      bookingId: 'booking-1',
    })
    expect(without).not.toContain('Don&#39;t forget to bring')
  })

  it('opens the guest reminder with the new copy, details, and sign-off', () => {
    const html = guestSessionReminderHtml({
      guestName: 'Sam',
      listingTitle: 'Latte art',
      sessionDate: formatReminderSessionDate(NEXT_DAY_START),
      startsAt: NEXT_DAY_START,
      sentAt: NEXT_DAY_SENT,
      duration: formatDuration(90),
      fullAddress: '12 Club Street, Singapore 069410',
      whatsProvided: ['Apron', 'Coffee beans'],
      hostName: 'Mei Ling',
      bookingId: 'booking-1',
      siteUrl: 'https://trykai.sg',
    })
    expect(html).toContain('Hi Sam!')
    expect(html).toContain("Your session is Tomorrow! We hope you're excited. Here's everything you need.")
    expect(hasDetail(html, 'Day and time', formatReminderSessionDate(NEXT_DAY_START))).toBe(true)
    expect(hasDetail(html, 'Duration', '1 hr 30 min')).toBe(true)
    expect(hasDetail(html, 'Address', '12 Club Street, Singapore 069410')).toBe(true)
    expect(hasDetail(html, "What&#39;s provided", 'Apron, Coffee beans')).toBe(true)
    expect(hasDetail(html, 'Host', 'Mei Ling')).toBe(true)
    expect(html).toContain('say hi to Mei Ling when you get there')
    expect(html).toContain('href="https://trykai.sg/bookings/booking-1"')
    expect(html).toContain('View booking')
    expect(html).toContain('Plans changed? You can manage your booking from the booking page.')
    expect(html).toContain('Have a great time!')
    expect(html).toContain('See you there,')
    expect(html).toContain(`src="${EMAIL_LOGO_URL}"`)
  })

  it('escapes titles, names and bring items in the guest reminder', () => {
    const html = guestSessionReminderHtml({
      guestName: '<b>Sam</b>',
      listingTitle: '<script>alert(1)</script>',
      sessionDate: 'Sun 25 Oct 2026, 9:00 am',
      startsAt: NEXT_DAY_START,
      sentAt: NEXT_DAY_SENT,
      whatToBring: ['<img src=x>'],
      hostName: '<img src=x>',
      bookingId: 'booking-1',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('Hi &lt;b&gt;Sam&lt;/b&gt;!')
    expect(html).not.toContain('<img src=x>')
    expect(html).toContain('&lt;img src=x&gt;')
  })

  it('lists guests on the host reminder and uses the new close', () => {
    const html = hostSessionReminderHtml({
      hostName: 'Mei',
      listingTitle: 'Latte art',
      sessionDate: formatReminderSessionDate(NEXT_DAY_START),
      startsAt: NEXT_DAY_START,
      sentAt: NEXT_DAY_SENT,
      guests: [
        { name: 'Sam', guestsCount: 2 },
        { name: 'Alex', guestsCount: 1 },
      ],
      totalGuests: 3,
      siteUrl: 'https://trykai.sg',
    })
    expect(html).toContain('Hi Mei!')
    expect(html).toContain('Thanks for sharing what you love!')
    expect(html).toContain('Sam · 2 guests')
    expect(html).toContain('Alex · 1 guest')
    expect(hasDetail(html, 'Day and time', formatReminderSessionDate(NEXT_DAY_START))).toBe(true)
    expect(html).toContain('href="https://trykai.sg/hosting"')
    expect(html).toContain('View hosting')
    expect(html).toContain('Need to change something? You can manage this session from your Hosting page.')
    expect(html).toContain('Hope it goes brilliantly. Have fun!')
    expect(html).toContain('See you there,')
  })

  it('escapes titles and names in the host reminder', () => {
    const html = hostSessionReminderHtml({
      hostName: '<b>Mei</b>',
      listingTitle: '<script>x</script>',
      sessionDate: 'Sun 25 Oct 2026, 9:00 am',
      startsAt: NEXT_DAY_START,
      sentAt: NEXT_DAY_SENT,
      guests: [{ name: '<img src=x>', guestsCount: 1 }],
      totalGuests: 1,
    })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).toContain('Hi &lt;b&gt;Mei&lt;/b&gt;!')
    expect(html).not.toContain('<img src=x>')
    expect(html).toContain('&lt;img src=x&gt;')
  })
})
