import {
  calculateGuestCharge,
  discountedLessonCents,
  groupDiscountRate,
} from './booking.ts'

const RESEND_FROM = 'TryKai <no-reply@trykai.sg>'
export const GUEST_REPLY_TO = 'hello@trykai.sg'
const DEFAULT_SITE_URL = 'https://trykai.sg'

export function formatCents(cents: number): string {
  const dollars = Number(cents) / 100
  if (!Number.isFinite(dollars)) return '$0'
  const formatted = new Intl.NumberFormat('en-SG', {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  }).format(dollars)
  return `$${formatted}`
}

/** First 8 characters of the booking id, uppercase. */
export function bookingReference(bookingId: string | null | undefined): string {
  return String(bookingId ?? '').slice(0, 8).toUpperCase()
}

/** Same wording as the listing page: "1 hr 30 min", never a raw minute count. */
export function formatDuration(mins: number | null | undefined): string {
  const total = Number(mins)
  if (!Number.isFinite(total) || total < 1) return ''
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  const parts: string[] = []
  if (hours) parts.push(`${hours} hr`)
  if (minutes) parts.push(`${minutes} min`)
  return parts.join(' ')
}

export function emailSiteUrl(value?: string | null): string {
  const raw = String(value ?? DEFAULT_SITE_URL).trim().replace(/\/$/, '')
  return raw || DEFAULT_SITE_URL
}

/**
 * Public surfaces show `display_name`. `firstName(full_name)` is only the
 * fallback while a row has no display name yet.
 */
export function publicDisplayName(user: {
  display_name?: string | null
  full_name?: string | null
} | null | undefined): string {
  if (!user || typeof user !== 'object') return ''
  const display = typeof user.display_name === 'string' ? user.display_name.trim() : ''
  if (display) return display
  if (typeof user.full_name !== 'string') return ''
  return user.full_name.trim().split(/\s+/).filter(Boolean)[0] ?? ''
}

export function formatPaymentMethod(options: {
  paymentRail?: string | null
  cardBrand?: string | null
  cardLast4?: string | null
}): string {
  if (options.paymentRail === 'paynow') return 'PayNow'
  const brand = formatCardBrand(options.cardBrand)
  const last4 = String(options.cardLast4 ?? '').replace(/\D/g, '').slice(-4)
  if (brand && last4) return `${brand} ending in ${last4}`
  if (last4) return `Card ending in ${last4}`
  return 'Card'
}

export function cardDetailsFromCharge(charge: unknown): {
  brand: string | null
  last4: string | null
} {
  if (!charge || typeof charge !== 'object') return { brand: null, last4: null }
  const details = (charge as { payment_method_details?: { card?: { brand?: unknown; last4?: unknown } } })
    .payment_method_details?.card
  const brand = typeof details?.brand === 'string' ? details.brand : null
  const last4 = typeof details?.last4 === 'string' ? details.last4 : null
  return { brand, last4 }
}

export function paymentMethodFromIntent(
  paymentRail: string | null | undefined,
  paymentIntent: { latest_charge?: unknown } | null | undefined,
): string {
  const charge =
    paymentIntent && typeof paymentIntent.latest_charge === 'object'
      ? paymentIntent.latest_charge
      : null
  const card = cardDetailsFromCharge(charge)
  return formatPaymentMethod({
    paymentRail: paymentRail === 'paynow' ? 'paynow' : 'card',
    cardBrand: card.brand,
    cardLast4: card.last4,
  })
}

export async function resolvePaymentMethod(options: {
  paymentRail?: string | null
  retrieveIntent?: () => Promise<{ latest_charge?: unknown } | null | undefined>
}): Promise<string> {
  if (options.paymentRail === 'paynow') {
    return formatPaymentMethod({ paymentRail: 'paynow' })
  }
  if (!options.retrieveIntent) {
    return formatPaymentMethod({ paymentRail: 'card' })
  }
  try {
    const intent = await options.retrieveIntent()
    return paymentMethodFromIntent(options.paymentRail, intent)
  } catch {
    return formatPaymentMethod({ paymentRail: 'card' })
  }
}

export function refundDeadlineLines(sessionStartsAt: string): string[] {
  const start = new Date(sessionStartsAt)
  if (Number.isNaN(start.getTime())) return []
  return [
    `Full refund if you cancel before ${formatSessionDate(shiftHours(start, -48))}`,
    `50% refund if you cancel before ${formatSessionDate(shiftHours(start, -24))}`,
    `25% refund if you cancel before ${formatSessionDate(shiftHours(start, -6))}`,
  ]
}

/**
 * Guest-facing receipt lines. The advertised all-in card price is the unit
 * price so a booking fee never appears as its own row. Group discount and
 * PayNow saving are the only reductions.
 */
export function receiptPriceLines(options: {
  pricePerPersonCents: number
  guestsCount: number
  groupPricing?: boolean
  paymentRail?: string | null
  totalPaidCents: number
}): string[] {
  const guestsCount = Math.max(1, Number(options.guestsCount) || 1)
  const groupPricing = options.groupPricing !== false
  const unit = calculateGuestCharge(options.pricePerPersonCents, 'card').totalAmount
  const listLesson = options.pricePerPersonCents * guestsCount
  const discountedLesson = discountedLessonCents(
    options.pricePerPersonCents,
    guestsCount,
    groupPricing,
  )
  const cardListTotal = calculateGuestCharge(listLesson, 'card').totalAmount
  const cardDiscountedTotal = calculateGuestCharge(discountedLesson, 'card').totalAmount
  const rate = groupDiscountRate(guestsCount, groupPricing)
  const lines = [`${formatCents(unit)} per person x ${guestsCount} guests`]
  if (rate > 0 && cardListTotal > cardDiscountedTotal) {
    lines.push(
      `Group discount (${Math.round(rate * 100)}%) −${formatCents(cardListTotal - cardDiscountedTotal)}`,
    )
  }
  if (options.paymentRail === 'paynow') {
    const paynowTotal = calculateGuestCharge(discountedLesson, 'paynow').totalAmount
    const saving = cardDiscountedTotal - paynowTotal
    if (saving > 0) lines.push(`PayNow saving ${formatCents(saving)}`)
  }
  lines.push(`Total paid ${formatCents(options.totalPaidCents)}`)
  return lines
}

export async function sendResendEmail(options: {
  apiKey: string | undefined
  to: string | null | undefined
  subject: string
  html: string
  replyTo?: string
}): Promise<void> {
  if (!options.apiKey) {
    console.error('sendResendEmail: RESEND_API_KEY is missing; email not sent', {
      to: options.to,
      subject: options.subject,
    })
    return
  }
  if (!options.to) return

  try {
    const body: Record<string, unknown> = {
      from: RESEND_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
    }
    if (options.replyTo) body.reply_to = options.replyTo

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('sendResendEmail: Resend request failed', err)
  }
}

export function bookingConfirmedGuestHtml(options: {
  bookingReference: string
  listingTitle: string
  hostName: string
  sessionDate: string
  duration?: string
  fullAddress?: string
  guestsCount: number
  pricePerPersonCents: number
  groupPricing?: boolean
  paymentRail?: string | null
  totalPaidCents: number
  paymentMethod: string
  sessionStartsAt: string
  guestId: string
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  const title = escapeHtml(options.listingTitle)
  const hostName = escapeHtml(options.hostName || 'your host')
  const priceLines = receiptPriceLines({
    pricePerPersonCents: options.pricePerPersonCents,
    guestsCount: options.guestsCount,
    groupPricing: options.groupPricing,
    paymentRail: options.paymentRail,
    totalPaidCents: options.totalPaidCents,
  })
  const deadlines = refundDeadlineLines(options.sessionStartsAt)
  const duration = options.duration ? escapeHtml(options.duration) : ''
  const address = options.fullAddress ? escapeHtml(options.fullAddress) : ''

  return wrapEmail(
    `
    <h2 style="margin:0 0 16px;font-size:22px;line-height:1.3;">Your booking is confirmed</h2>
    <p style="margin:0 0 16px;"><strong>Booking reference:</strong> ${escapeHtml(options.bookingReference)}</p>
    <p style="margin:0 0 8px;">You are booked for <strong>${title}</strong> with ${hostName}.</p>
    <p style="margin:0 0 8px;"><strong>Date and time:</strong> ${escapeHtml(options.sessionDate)}</p>
    ${duration ? `<p style="margin:0 0 8px;"><strong>Duration:</strong> ${duration}</p>` : ''}
    ${address ? `<p style="margin:0 0 8px;"><strong>Address:</strong> ${address}</p>` : ''}
    <p style="margin:0 0 16px;"><strong>Guests:</strong> ${options.guestsCount}</p>
    ${priceLines.map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`).join('\n    ')}
    <p style="margin:0 0 16px;"><strong>Payment method:</strong> ${escapeHtml(options.paymentMethod)}</p>
    ${deadlines.map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`).join('\n    ')}
    <p style="margin:24px 0;">
      <a href="${siteUrl}/u/${encodeURIComponent(options.guestId)}?tab=bookings" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">View booking</a>
    </p>
    <p style="margin:0 0 8px;">Questions for your host? Reply to this email.</p>
    <p style="margin:0;"><a href="${siteUrl}" style="color:#111;">Browse more experiences</a></p>
    `,
    siteUrl,
  )
}

export function bookingConfirmedHostHtml(options: {
  bookingReference: string
  guestName: string
  listingTitle: string
  sessionDate: string
  guestsCount: number
  hostPayoutCents: number
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  return wrapEmail(
    `
    <h2 style="margin:0 0 16px;font-size:22px;line-height:1.3;">You've got a new booking!</h2>
    <p style="margin:0 0 16px;"><strong>Booking reference:</strong> ${escapeHtml(options.bookingReference)}</p>
    <p style="margin:0 0 8px;"><strong>${escapeHtml(options.guestName)}</strong> just booked your session.</p>
    <p style="margin:0 0 8px;"><strong>Listing:</strong> ${escapeHtml(options.listingTitle)}</p>
    <p style="margin:0 0 8px;"><strong>Date and time:</strong> ${escapeHtml(options.sessionDate)}</p>
    <p style="margin:0 0 16px;"><strong>Guests:</strong> ${options.guestsCount}</p>
    <p style="margin:0;">${hostPayoutLine(options.hostPayoutCents)}</p>
    `,
    siteUrl,
  )
}

export function verificationApprovedHtml(options: { hostName?: string | null }): string {
  const greeting = options.hostName ? `You're verified, ${options.hostName}!` : "You're verified!"
  return `
    <h2>${greeting}</h2>
    <p>Your identity verification has been approved. You can now create listings on TryKai.</p>
    <p><a href="https://trykai.sg/create-listing">Create your first listing</a></p>
  `
}

/**
 * The reason is the whole point of this email: "rejected" with no explanation
 * is not a state a host can act on. It is written by a reviewer, so escape it.
 */
export function verificationRejectedHtml(options: {
  hostName?: string | null
  reason: string
}): string {
  const greeting = options.hostName ? `Hi ${options.hostName},` : 'Hi,'
  return `
    <h2>${escapeHtml(greeting)}</h2>
    <p>We were unable to verify your identity with the documents provided.</p>
    <p><strong>What we found:</strong> ${escapeHtml(options.reason)}</p>
    <p>You can submit new documents whenever you are ready.</p>
    <p><a href="https://trykai.sg/verify-identity">Resubmit verification</a></p>
  `
}

export function bookingCancelledGuestHtml(options: {
  bookingReference: string
  listingTitle: string
  sessionDate: string
  refundAmountCents: number
  cancelledBy: 'guest' | 'host'
  guestsCount: number
  paymentMethod: string
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  const who =
    options.cancelledBy === 'host'
      ? 'The host cancelled your booking'
      : 'Your booking has been cancelled'
  return wrapEmail(
    `
    <h2 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${who}</h2>
    <p style="margin:0 0 16px;"><strong>Booking reference:</strong> ${escapeHtml(options.bookingReference)}</p>
    <p style="margin:0 0 8px;">The session was <strong>${escapeHtml(options.listingTitle)}</strong> on ${escapeHtml(options.sessionDate)}.</p>
    <p style="margin:0 0 16px;"><strong>Guests:</strong> ${options.guestsCount}</p>
    <p style="margin:0 0 8px;"><strong>Refund amount:</strong> ${escapeHtml(formatCents(options.refundAmountCents))}</p>
    <p style="margin:0;"><strong>Refund method:</strong> ${escapeHtml(options.paymentMethod)}</p>
    `,
    siteUrl,
  )
}

export function bookingCancelledHostHtml(options: {
  bookingReference: string
  guestName: string
  listingTitle: string
  sessionDate: string
  guestsCount: number
  hostPayoutCents: number
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  return wrapEmail(
    `
    <h2 style="margin:0 0 16px;font-size:22px;line-height:1.3;">A guest cancelled</h2>
    <p style="margin:0 0 16px;"><strong>Booking reference:</strong> ${escapeHtml(options.bookingReference)}</p>
    <p style="margin:0 0 8px;"><strong>${escapeHtml(options.guestName)}</strong> cancelled their booking for <strong>${escapeHtml(options.listingTitle)}</strong>.</p>
    <p style="margin:0 0 8px;"><strong>Date and time:</strong> ${escapeHtml(options.sessionDate)}</p>
    <p style="margin:0 0 16px;"><strong>Guests:</strong> ${options.guestsCount}</p>
    <p style="margin:0 0 8px;">${hostPayoutLine(options.hostPayoutCents)}</p>
    <p style="margin:0;">The spot is available again.</p>
    `,
    siteUrl,
  )
}

/** Hosts see only their payout, never a guest's payment or refund. */
export function hostPayoutLine(cents: number): string {
  if (cents > 0) return `You'll receive ${formatCents(cents)}`
  return "You won't receive a payout for this booking"
}

/**
 * Guest always hears the refund amount, including $0. The host is only told
 * when the guest cancelled — the host already knows about their own cancel.
 * Never throws: a Resend failure must not undo a refund that already happened.
 */
export async function sendCancellationEmails(options: {
  apiKey: string | undefined
  cancelledBy: 'guest' | 'host'
  refundAmountCents: number
  bookingReference: string
  listingTitle: string
  sessionDate: string
  guestEmail: string | null | undefined
  hostEmail: string | null | undefined
  guestName?: string | null
  guestsCount: number
  paymentMethod: string
  hostPayoutCents?: number
  siteUrl?: string
}): Promise<void> {
  try {
    await sendResendEmail({
      apiKey: options.apiKey,
      to: options.guestEmail,
      subject: `Booking cancelled: ${options.listingTitle}`,
      html: bookingCancelledGuestHtml({
        bookingReference: options.bookingReference,
        listingTitle: options.listingTitle,
        sessionDate: options.sessionDate,
        refundAmountCents: options.refundAmountCents,
        cancelledBy: options.cancelledBy,
        guestsCount: options.guestsCount,
        paymentMethod: options.paymentMethod,
        siteUrl: options.siteUrl,
      }),
    })
    if (options.cancelledBy === 'guest') {
      await sendResendEmail({
        apiKey: options.apiKey,
        to: options.hostEmail,
        subject: `A guest cancelled "${options.listingTitle}"`,
        html: bookingCancelledHostHtml({
          bookingReference: options.bookingReference,
          guestName: options.guestName || 'A guest',
          listingTitle: options.listingTitle,
          sessionDate: options.sessionDate,
          guestsCount: options.guestsCount,
          hostPayoutCents: options.hostPayoutCents ?? 0,
          siteUrl: options.siteUrl,
        }),
      })
    }
  } catch (err) {
    console.error('sendCancellationEmails failed', err)
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  })
}

function formatCardBrand(brand?: string | null): string {
  if (!brand) return ''
  const known: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    american_express: 'American Express',
    discover: 'Discover',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    diners: 'Diners Club',
  }
  const key = brand.toLowerCase()
  if (known[key]) return known[key]
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

function shiftHours(date: Date, hours: number): string {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString()
}

function wrapEmail(body: string, siteUrl: string): string {
  const base = emailSiteUrl(siteUrl)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TryKai</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;padding:28px 24px;border-radius:8px;">
          <tr>
            <td style="font-size:16px;line-height:1.5;">
              ${body}
              <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #e5e5e5;font-size:13px;line-height:1.6;color:#666;">
                TryKai<br>
                UEN 53526159D<br>
                <a href="${base}/terms" style="color:#666;">Terms</a>
                &nbsp;·&nbsp;
                <a href="${base}/privacy" style="color:#666;">Privacy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
