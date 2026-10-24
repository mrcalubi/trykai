import {
  calculateGuestCharge,
  discountedLessonCents,
  groupDiscountRate,
} from './booking.ts'
import {
  groupSizeRange,
  type InterestSummary,
  interestTallies,
  keenPeopleLine,
} from './interest.ts'

const RESEND_FROM = 'TryKai <no-reply@trykai.sg>'
export const GUEST_REPLY_TO = 'hello@trykai.sg'
const DEFAULT_SITE_URL = 'https://trykai.sg'

/**
 * Brand colours from DESIGN.md section 2, inlined because email clients drop
 * <style> blocks and CSS variables. Coral is for the wordmark dot only; it is
 * never text or a button (3.1:1 on white).
 */
export const EMAIL_COLORS = {
  navy: '#16264B',
  cream: '#F4F1EA',
  surface: '#FBFAF6',
  white: '#FFFFFF',
  coral: '#D97756',
  muted: '#4E586C',
  border: '#E4DED2',
} as const

/**
 * Always the production asset. Staging sits behind Vercel login, so an image
 * served from it would show as broken in every inbox.
 */
export const EMAIL_LOGO_URL = `${DEFAULT_SITE_URL}/trykai.png`

const FONT_STACK = "Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
const DISPLAY_STACK = "'Bricolage Grotesque',Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
const LINK_STYLE = `color:${EMAIL_COLORS.navy};font-weight:600;`
const QUIET_LINK_STYLE = `color:${EMAIL_COLORS.muted};`

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

export function guestCountLabel(count: number): string {
  const n = Math.max(1, Number(count) || 1)
  return n === 1 ? '1 guest' : `${n} guests`
}

export function formatSessionDay(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Singapore',
  })
}

export function formatSessionTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-SG', {
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  })
}

export function bookingConfirmedGuestSubject(listingTitle: string, startsAt: string): string {
  const day = formatSessionDay(startsAt)
  return day ? `You're in! ${listingTitle} on ${day}` : `You're in! ${listingTitle}`
}

export function googleCalendarUrl(options: {
  title: string
  startsAt: string
  durationMins?: number | null
  address?: string | null
}): string {
  const start = new Date(options.startsAt)
  if (Number.isNaN(start.getTime())) return ''
  const mins = Number(options.durationMins)
  const duration = Number.isFinite(mins) && mins > 0 ? mins : 60
  const end = new Date(start.getTime() + duration * 60 * 1000)
  const stamp = (value: Date) =>
    value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: options.title || 'TryKai session',
  })
  if (options.address) params.set('location', options.address)
  const dates = `${stamp(start)}/${stamp(end)}`
  return `https://calendar.google.com/calendar/render?${params.toString()}&dates=${dates}`
}

export function refundTimingCopy(paymentRail?: string | null): string {
  if (paymentRail === 'paynow') {
    return 'PayNow refunds are usually faster than card refunds.'
  }
  return 'Card refunds usually take 5 to 10 business days to appear.'
}

export function bookingCancelledGuestSubject(options: {
  cancelledBy: 'guest' | 'host'
  listingTitle: string
  refundAmountCents: number
  hostName?: string | null
}): string {
  if (options.cancelledBy === 'host') {
    return `${options.hostName || 'Your host'} had to cancel ${options.listingTitle}`
  }
  if (options.refundAmountCents > 0) {
    return `Booking cancelled: ${options.listingTitle} · ${formatCents(options.refundAmountCents)} refund`
  }
  return `Booking cancelled: ${options.listingTitle}`
}

export function refundMethodNoun(paymentRail?: string | null): string {
  return paymentRail === 'paynow' ? 'PayNow' : 'card'
}

export function hostRefundedGuestsLine(guestCount: number): string {
  const n = Math.max(1, Number(guestCount) || 1)
  if (n === 1) return 'Your guest has been refunded in full.'
  if (n === 2) return 'Both guests have been refunded in full.'
  return `All ${n} guests have been refunded in full.`
}

function emailGreeting(name?: string | null): string {
  const who = (name || '').trim()
  return who ? `Hi ${escapeHtml(who)},` : 'Hi,'
}

function emailSignOff(kind: 'see-you' | 'take-care'): string {
  const line = kind === 'see-you' ? 'See you there,' : 'Take care,'
  return `<p style="margin:24px 0 0;">${line}<br>The TryKai team</p>`
}

function primaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
      <tr><td style="background:${EMAIL_COLORS.navy};border-radius:12px;">
        <a href="${href}" style="display:inline-block;padding:14px 24px;color:${EMAIL_COLORS.white};text-decoration:none;font-weight:700;font-size:16px;line-height:20px;">${escapeHtml(label)}</a>
      </td></tr>
    </table>`
}

/** Label and value rows. Values arrive already escaped. */
function detailRows(rows: Array<[string, string] | null | false | undefined>): string {
  const cells = rows
    .filter((row): row is [string, string] => Boolean(row && row[1]))
    .map(
      ([label, value]) => `<tr>
          <td style="padding:6px 16px 6px 0;vertical-align:top;white-space:nowrap;font-size:14px;color:${EMAIL_COLORS.muted};">${escapeHtml(label)}</td>
          <td style="padding:6px 0;vertical-align:top;font-size:15px;color:${EMAIL_COLORS.navy};">${value}</td>
        </tr>`,
    )
    .join('\n')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        ${cells}
      </table>`
}

function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 8px;font-family:${DISPLAY_STACK};font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.02em;color:${EMAIL_COLORS.navy};">${escapeHtml(text)}</h1>`
}

function whatsProvidedCopy(items?: string[] | null): string {
  if (!Array.isArray(items)) return ''
  const clean = items.map((item) => String(item).trim()).filter((item) => item && item !== 'None')
  return clean.join(', ')
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

export type ReceiptRow = { label: string; amountCents: number | null }

/**
 * Guest-facing receipt. The advertised all-in card price is the unit price so
 * a booking fee never appears as its own row. Group discount (already inside
 * the unit price) and PayNow saving are the only reductions.
 *
 * `addsUp` is false when the rows would not sum to what the guest actually
 * paid (an older booking, a price edited after booking). The email then shows
 * only the total, never a breakdown that does not add up.
 */
export function receiptRows(options: {
  pricePerPersonCents: number
  guestsCount: number
  groupPricing?: boolean
  paymentRail?: string | null
  totalPaidCents: number
}): { rows: ReceiptRow[]; totalCents: number; addsUp: boolean } {
  const guestsCount = Math.max(1, Number(options.guestsCount) || 1)
  const groupPricing = options.groupPricing !== false
  const listLesson = options.pricePerPersonCents * guestsCount
  const discountedLesson = discountedLessonCents(
    options.pricePerPersonCents,
    guestsCount,
    groupPricing,
  )
  const cardListTotal = calculateGuestCharge(listLesson, 'card').totalAmount
  const cardDiscountedTotal = calculateGuestCharge(discountedLesson, 'card').totalAmount
  const perPerson = Math.round(cardDiscountedTotal / guestsCount)
  const rate = groupDiscountRate(guestsCount, groupPricing)

  const rows: ReceiptRow[] = [
    {
      label: `${formatCents(perPerson)} per person x ${guestCountLabel(guestsCount)}`,
      amountCents: cardDiscountedTotal,
    },
  ]
  if (rate > 0 && cardListTotal > cardDiscountedTotal) {
    rows.push({ label: `Group discount (${Math.round(rate * 100)}%)`, amountCents: null })
  }
  let expectedTotal = cardDiscountedTotal
  if (options.paymentRail === 'paynow') {
    const paynowTotal = calculateGuestCharge(discountedLesson, 'paynow').totalAmount
    const saving = cardDiscountedTotal - paynowTotal
    if (saving > 0) rows.push({ label: 'PayNow saving', amountCents: -saving })
    expectedTotal = paynowTotal
  }
  return {
    rows,
    totalCents: options.totalPaidCents,
    addsUp: expectedTotal === options.totalPaidCents,
  }
}

/** Plain-text form of the receipt, one line per row. */
export function receiptPriceLines(options: {
  pricePerPersonCents: number
  guestsCount: number
  groupPricing?: boolean
  paymentRail?: string | null
  totalPaidCents: number
}): string[] {
  const { rows, totalCents } = receiptRows(options)
  const lines = rows.map((row) =>
    row.amountCents !== null && row.amountCents < 0
      ? `${row.label} ${formatCents(-row.amountCents)}`
      : row.label,
  )
  lines.push(`Total paid ${formatCents(totalCents)}`)
  return lines
}

function receiptAmount(cents: number): string {
  return cents < 0 ? `−${escapeHtml(formatCents(-cents))}` : escapeHtml(formatCents(cents))
}

function receiptBlock(receipt: { rows: ReceiptRow[]; totalCents: number; addsUp: boolean }, paymentMethod: string): string {
  const lineRows = receipt.addsUp
    ? receipt.rows
        .map(
          (row) => `<tr>
              <td style="padding:6px 0;font-size:15px;color:${EMAIL_COLORS.navy};">${escapeHtml(row.label)}</td>
              <td align="right" style="padding:6px 0;font-size:15px;color:${EMAIL_COLORS.navy};white-space:nowrap;">${row.amountCents === null ? '<span style="color:' + EMAIL_COLORS.muted + ';">Included</span>' : receiptAmount(row.amountCents)}</td>
            </tr>`,
        )
        .join('\n')
    : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;background:${EMAIL_COLORS.surface};border:1px solid ${EMAIL_COLORS.border};border-radius:16px;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_COLORS.muted};">Receipt</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${lineRows}
            <tr>
              <td style="padding:10px 0 4px;border-top:1px solid ${EMAIL_COLORS.border};font-size:16px;font-weight:700;color:${EMAIL_COLORS.navy};">Total paid</td>
              <td align="right" style="padding:10px 0 4px;border-top:1px solid ${EMAIL_COLORS.border};font-size:16px;font-weight:700;color:${EMAIL_COLORS.navy};white-space:nowrap;">${escapeHtml(formatCents(receipt.totalCents))}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:4px 0 0;font-size:13px;color:${EMAIL_COLORS.muted};">Paid with ${escapeHtml(paymentMethod)}</td>
            </tr>
          </table>
        </td></tr>
      </table>`
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
  guestName?: string | null
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
  durationMins?: number | null
  whatsProvided?: string[] | null
  bookingId: string
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  const hostName = escapeHtml(options.hostName || 'your host')
  const provided = whatsProvidedCopy(options.whatsProvided)
  const duration = options.duration ? escapeHtml(options.duration) : ''
  const address = options.fullAddress ? escapeHtml(options.fullAddress) : ''
  const calendar = googleCalendarUrl({
    title: options.listingTitle,
    startsAt: options.sessionStartsAt,
    durationMins: options.durationMins,
    address: options.fullAddress,
  })

  const receipt = receiptRows({
    pricePerPersonCents: options.pricePerPersonCents,
    guestsCount: options.guestsCount,
    groupPricing: options.groupPricing,
    paymentRail: options.paymentRail,
    totalPaidCents: options.totalPaidCents,
  })

  return wrapEmail(
    `
    <p style="margin:0 0 16px;">${emailGreeting(options.guestName)}</p>
    ${emailHeading(options.listingTitle)}
    <p style="margin:0 0 20px;color:${EMAIL_COLORS.muted};">You're booked with ${hostName}. Here's everything you need.</p>
    ${detailRows([
      ['Date and time', escapeHtml(options.sessionDate)],
      ['Duration', duration],
      ['Address', address],
      ['Guests', guestCountLabel(options.guestsCount)],
      ["What's provided", provided ? escapeHtml(provided) : ''],
      ['Booking reference', escapeHtml(options.bookingReference)],
    ])}
    ${receiptBlock(receipt, options.paymentMethod)}
    ${options.paymentRail === 'paynow' ? `<p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.muted};">Your bank will show this payment as Stripe Payments Singapore.</p>` : ''}
    ${calendar ? `<p style="margin:0 0 8px;"><a href="${escapeHtml(calendar)}" style="${LINK_STYLE}">Add to Google Calendar</a></p>` : ''}
    ${primaryButton(`${siteUrl}/bookings/${encodeURIComponent(options.bookingId)}`, 'View booking')}
    <p style="margin:0 0 8px;">Questions for your host? Reply to this email.</p>
    <p style="margin:0 0 16px;"><a href="${siteUrl}" style="${LINK_STYLE}">Browse more experiences</a></p>
    <p style="margin:0;font-size:13px;color:${EMAIL_COLORS.muted};">Need to change plans? <a href="${siteUrl}/cancellation-policy" style="${QUIET_LINK_STYLE}">Cancellation policy</a></p>
    ${emailSignOff('see-you')}
    `,
    siteUrl,
    `${options.listingTitle} · ${options.sessionDate} · Ref ${options.bookingReference}`,
  )
}

export function bookingConfirmedHostHtml(options: {
  bookingReference: string
  hostName?: string | null
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
    <p style="margin:0 0 16px;">${emailGreeting(options.hostName)}</p>
    <p style="margin:0 0 16px;"><strong>${escapeHtml(options.guestName)}</strong> just booked your session.</p>
    <p style="margin:0 0 16px;"><strong>Booking reference:</strong> ${escapeHtml(options.bookingReference)}</p>
    <p style="margin:0 0 8px;"><strong>Listing:</strong> ${escapeHtml(options.listingTitle)}</p>
    <p style="margin:0 0 8px;"><strong>Date and time:</strong> ${escapeHtml(options.sessionDate)}</p>
    <p style="margin:0 0 16px;"><strong>Guests:</strong> ${guestCountLabel(options.guestsCount)}</p>
    <p style="margin:0;">${hostPayoutLine(options.hostPayoutCents)}</p>
    ${emailSignOff('see-you')}
    `,
    siteUrl,
  )
}

export function guestSessionReminderSubject(listingTitle: string, startsAt: string): string {
  const time = formatSessionTime(startsAt)
  return time ? `Tomorrow: ${listingTitle}, ${time}` : `Tomorrow: ${listingTitle}`
}

export function guestSessionReminderHtml(options: {
  guestName?: string | null
  listingTitle: string
  sessionDate: string
  duration?: string
  fullAddress?: string
  whatsProvided?: string[] | null
  hostName: string
  bookingId: string
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  const provided = whatsProvidedCopy(options.whatsProvided)
  const duration = options.duration ? escapeHtml(options.duration) : ''
  const address = options.fullAddress ? escapeHtml(options.fullAddress) : ''
  const hostName = escapeHtml(options.hostName || 'your host')
  return wrapEmail(
    `
    <p style="margin:0 0 16px;">${emailGreeting(options.guestName)}</p>
    <p style="margin:0 0 16px;">Your session is coming up! Hope you're excited.</p>
    ${emailHeading(options.listingTitle)}
    ${detailRows([
      ['Day and time', escapeHtml(options.sessionDate)],
      ['Duration', duration],
      ['Address', address],
      ["What's provided", provided ? escapeHtml(provided) : ''],
      ['Host', hostName],
    ])}
    ${primaryButton(`${siteUrl}/bookings/${encodeURIComponent(options.bookingId)}`, 'View booking')}
    <p style="margin:0 0 8px;">Need to change plans? You can do that on your booking page.</p>
    ${emailSignOff('see-you')}
    `,
    siteUrl,
    `Tomorrow: ${options.listingTitle}, ${options.sessionDate}`,
  )
}

export function hostSessionReminderSubject(listingTitle: string, totalGuests: number): string {
  const n = Math.max(0, Number(totalGuests) || 0)
  return `Tomorrow: ${n} ${n === 1 ? 'person' : 'people'} coming to ${listingTitle}`
}

export function hostSessionReminderHtml(options: {
  hostName?: string | null
  listingTitle: string
  sessionDate: string
  guests: Array<{ name: string; guestsCount: number }>
  totalGuests: number
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  const who = (options.guests ?? [])
    .map((guest) => {
      const name = escapeHtml(guest.name || 'A guest')
      return `${name} · ${escapeHtml(guestCountLabel(guest.guestsCount))}`
    })
    .join('<br>')
  const total = Math.max(0, Number(options.totalGuests) || 0)
  const totalLabel = `${total} ${total === 1 ? 'person' : 'people'}`
  return wrapEmail(
    `
    <p style="margin:0 0 16px;">${emailGreeting(options.hostName)}</p>
    ${emailHeading(options.listingTitle)}
    ${detailRows([
      ["Who's coming", who],
      ['Total', escapeHtml(totalLabel)],
      ['Day and time', escapeHtml(options.sessionDate)],
    ])}
    ${primaryButton(`${siteUrl}/hosting`, 'View hosting')}
    <p style="margin:0 0 8px;">Hope it goes brilliantly.</p>
    ${emailSignOff('see-you')}
    `,
    siteUrl,
    `Tomorrow: ${totalLabel} coming to ${options.listingTitle}`,
  )
}

/**
 * Supabase Auth's "Confirm signup" email. Supabase sends this one itself, so the
 * HTML is pasted into the dashboard (Authentication, Emails, Confirm signup) on
 * staging and production instead of being sent from an Edge Function.
 * {{ .Token }}, {{ .ConfirmationURL }} and {{ .SiteURL }} are Supabase's Go
 * template variables. The copy in supabase/templates/confirm-signup.html is
 * generated from this (UPDATE_AUTH_TEMPLATES=1 npx vitest run email.test) and
 * a test fails if it drifts.
 */
export const CONFIRM_SIGNUP_SUBJECT = 'Your TryKai code: {{ .Token }}'

export function confirmSignupTemplateHtml(): string {
  const code = `<p style="margin:12px 0 16px;font-family:${DISPLAY_STACK};font-size:34px;line-height:40px;font-weight:700;letter-spacing:0.16em;color:${EMAIL_COLORS.navy};">{{ .Token }}</p>`
  return wrapEmail(
    `${emailHeading('Confirm your email')}
      <p style="margin:0;">Enter this code on TryKai to finish signing up:</p>
      ${code}
      <p style="margin:0;">Or tap the button instead.</p>
      ${primaryButton('{{ .ConfirmationURL }}', 'Confirm my email')}
      <p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:${EMAIL_COLORS.muted};">The code works for an hour. Didn't sign up for TryKai? You can ignore this email.</p>`,
    '{{ .SiteURL }}',
    'Your code is {{ .Token }}',
  )
}

// ===========================================================================
// Listing review (00036): every new listing is checked before guests see it.
// ===========================================================================

export function listingSubmittedSubject(title: string, resubmitted: boolean): string {
  return `${resubmitted ? 'Listing updated for review' : 'New listing to review'}: ${title}`
}

/** To the TryKai team, the moment a host creates (or fixes) a listing. */
export function listingSubmittedOpsHtml(options: {
  siteUrl: string
  listingId: string
  title: string
  description: string | null
  category: string | null
  area: string | null
  priceCents: number | null
  photoCount: number
  hostName: string
  hostEmail: string
  verifiedName: string | null
  verificationMethod: string | null
  resubmitted: boolean
}): string {
  const base = emailSiteUrl(options.siteUrl)
  const price = Number.isInteger(options.priceCents) && (options.priceCents as number) > 0
    ? `S${formatCents(options.priceCents as number)} per person`
    : 'No price'
  const who = options.verificationMethod === 'singpass' && options.verifiedName
    ? `${escapeHtml(options.hostName)} (Singpass: ${escapeHtml(options.verifiedName)})`
    : escapeHtml(options.hostName)
  return wrapEmail(
    `${emailHeading(options.resubmitted ? 'A listing was updated for review' : 'A new listing needs a look')}
    <p style="margin:0 0 16px;">It stays hidden from guests until you approve it. The host can already add dates.</p>
    ${detailRows([
      ['Listing', `<strong>${escapeHtml(options.title)}</strong>`],
      ['Host', `${who}<br>${escapeHtml(options.hostEmail)}`],
      ['Category', escapeHtml(options.category ?? '')],
      ['Area', escapeHtml(options.area ?? '')],
      ['Price', escapeHtml(price)],
      ['Photos', String(options.photoCount)],
    ])}
    <p style="margin:0 0 4px;font-size:14px;color:${EMAIL_COLORS.muted};">Description</p>
    <p style="margin:0;white-space:pre-wrap;">${escapeHtml((options.description ?? '').slice(0, 1200))}</p>
    ${primaryButton(`${base}/admin/listings`, 'Review it')}`,
    base,
    `${options.title} by ${options.hostName}`,
  )
}

export function listingApprovedSubject(title: string): string {
  return `${title} is live on TryKai`
}

export function listingApprovedHtml(options: {
  siteUrl: string
  hostName?: string | null
  listingId: string
  title: string
}): string {
  const base = emailSiteUrl(options.siteUrl)
  return wrapEmail(
    `${emailHeading('Your listing is live')}
    <p style="margin:0 0 16px;">${emailGreeting(options.hostName)}</p>
    <p style="margin:0 0 16px;"><strong>${escapeHtml(options.title)}</strong> is now on TryKai for guests to find and book. Share the link with your friends to get your first bookings.</p>
    ${primaryButton(`${base}/listings/${encodeURIComponent(options.listingId)}`, 'See your listing')}
    ${emailSignOff('see-you')}`,
    base,
  )
}

export function listingChangesSubject(title: string): string {
  return `One thing to fix on ${title}`
}

export function listingChangesHtml(options: {
  siteUrl: string
  hostName?: string | null
  listingId: string
  title: string
  note: string
}): string {
  const base = emailSiteUrl(options.siteUrl)
  return wrapEmail(
    `${emailHeading('Almost there')}
    <p style="margin:0 0 16px;">${emailGreeting(options.hostName)}</p>
    <p style="margin:0 0 16px;">We had a look at <strong>${escapeHtml(options.title)}</strong> before it goes live. One thing to change first:</p>
    <p style="margin:0 0 16px;padding:12px 16px;background:${EMAIL_COLORS.cream};border-radius:12px;white-space:pre-wrap;">${escapeHtml(options.note)}</p>
    <p style="margin:0 0 16px;">Once you save your edit, it comes straight back to us.</p>
    ${primaryButton(`${base}/edit-listing/${encodeURIComponent(options.listingId)}`, 'Edit your listing')}
    ${emailSignOff('take-care')}`,
    base,
  )
}

export function verificationApprovedHtml(options: { hostName?: string | null }): string {
  const name = (options.hostName || '').trim()
  const greeting = name ? `You're verified, ${name}!` : "You're verified!"
  return wrapEmail(
    `
    ${emailHeading(greeting)}
    <p style="margin:0 0 16px;">Your identity verification has been approved. You can now create listings on TryKai.</p>
    ${primaryButton(`${DEFAULT_SITE_URL}/create-listing`, 'Create your first listing')}
    ${emailSignOff('see-you')}
    `,
    DEFAULT_SITE_URL,
  )
}

/**
 * The reason is the whole point of this email: "rejected" with no explanation
 * is not a state a host can act on. It is written by a reviewer, so escape it.
 */
export function verificationRejectedHtml(options: {
  hostName?: string | null
  reason: string
}): string {
  return wrapEmail(
    `
    <p style="margin:0 0 16px;">${emailGreeting(options.hostName)}</p>
    <p style="margin:0 0 16px;">We were unable to verify your identity with the documents provided.</p>
    <p style="margin:0 0 16px;"><strong>What we found:</strong> ${escapeHtml(options.reason)}</p>
    <p style="margin:0 0 16px;">You can submit new documents whenever you are ready.</p>
    ${primaryButton(`${DEFAULT_SITE_URL}/verify-identity`, 'Resubmit verification')}
    ${emailSignOff('take-care')}
    `,
    DEFAULT_SITE_URL,
  )
}

export function bookingCancelledGuestHtml(options: {
  bookingReference: string
  listingTitle: string
  sessionDate: string
  refundAmountCents: number
  cancelledBy: 'guest' | 'host'
  guestsCount: number
  paymentRail?: string | null
  paymentMethod: string
  guestName?: string | null
  hostName?: string | null
  listingId?: string | null
  listingCategory?: string | null
  hasOtherSessions?: boolean
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  const hostName = options.hostName || 'your host'
  const listingPath = options.listingId ? `${siteUrl}/listings/${encodeURIComponent(options.listingId)}` : siteUrl
  const similarHref = options.listingCategory
    ? `${siteUrl}/?category=${encodeURIComponent(options.listingCategory)}`
    : siteUrl
  const method = refundMethodNoun(options.paymentRail)
  const timing = refundTimingCopy(options.paymentRail)
  const refund = formatCents(options.refundAmountCents)

  const body =
    options.cancelledBy === 'host'
      ? `<p style="margin:0 0 16px;">We're sorry. ${escapeHtml(hostName)} had to cancel your session on ${escapeHtml(options.sessionDate)}. You'll get a full refund of ${escapeHtml(refund)}. ${escapeHtml(timing)}</p>`
      : options.refundAmountCents > 0
        ? `<p style="margin:0 0 16px;">Sorry you can't make it</p>
    <p style="margin:0 0 16px;">Your refund of ${escapeHtml(refund)} is on its way to your ${escapeHtml(method)}. ${escapeHtml(timing)}</p>`
        : `<p style="margin:0 0 16px;">Sorry you can't make it</p>
    <p style="margin:0 0 16px;">There's no refund for this cancellation.</p>`

  const cta =
    options.cancelledBy === 'host'
      ? options.hasOtherSessions
        ? primaryButton(listingPath, `See ${hostName}'s other sessions`)
        : primaryButton(similarHref, 'Find something similar')
      : primaryButton(listingPath, `Find another time with ${hostName}`)

  return wrapEmail(
    `
    <p style="margin:0 0 16px;">${emailGreeting(options.guestName)}</p>
    ${body}
    <p style="margin:0 0 8px;"><strong>Listing:</strong> ${escapeHtml(options.listingTitle)}</p>
    <p style="margin:0 0 16px;"><strong>Date and time:</strong> ${escapeHtml(options.sessionDate)}</p>
    <p style="margin:0 0 16px;"><strong>Booking reference:</strong> ${escapeHtml(options.bookingReference)}</p>
    <p style="margin:0 0 16px;"><strong>Guests:</strong> ${guestCountLabel(options.guestsCount)}</p>
    ${cta}
    <p style="margin:0;"><a href="${siteUrl}" style="${LINK_STYLE}">Browse other experiences</a></p>
    ${emailSignOff('take-care')}
    `,
    siteUrl,
  )
}

export function bookingCancelledHostHtml(options: {
  bookingReference: string
  hostName?: string | null
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
    <p style="margin:0 0 16px;">${emailGreeting(options.hostName)}</p>
    <p style="margin:0 0 16px;"><strong>${escapeHtml(options.guestName)}</strong> cancelled their booking for <strong>${escapeHtml(options.listingTitle)}</strong>.</p>
    <p style="margin:0 0 16px;"><strong>Booking reference:</strong> ${escapeHtml(options.bookingReference)}</p>
    <p style="margin:0 0 8px;"><strong>Date and time:</strong> ${escapeHtml(options.sessionDate)}</p>
    <p style="margin:0 0 16px;"><strong>Guests:</strong> ${guestCountLabel(options.guestsCount)}</p>
    <p style="margin:0 0 8px;">${hostPayoutLine(options.hostPayoutCents)}</p>
    <p style="margin:0;">The spot is available again.</p>
    ${emailSignOff('take-care')}
    `,
    siteUrl,
  )
}

export function hostSessionCancelledHtml(options: {
  hostName?: string | null
  listingTitle: string
  sessionDate: string
  guestCount: number
  strikeCount: number
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  return wrapEmail(
    `
    <p style="margin:0 0 16px;">${emailGreeting(options.hostName)}</p>
    <p style="margin:0 0 16px;">You cancelled ${escapeHtml(options.listingTitle)} on ${escapeHtml(options.sessionDate)}. ${escapeHtml(hostRefundedGuestsLine(options.guestCount))} This is strike ${options.strikeCount} of 3; at 3 your listings are paused.</p>
    <p style="margin:0;"><a href="${siteUrl}/cancellation-policy#appeals" style="${LINK_STYLE}">Appeal this strike</a></p>
    ${emailSignOff('take-care')}
    `,
    siteUrl,
  )
}

export async function sendHostSessionCancelledEmail(options: {
  apiKey: string | undefined
  hostEmail: string | null | undefined
  hostName?: string | null
  listingTitle: string
  sessionDate: string
  guestCount: number
  strikeCount: number
  siteUrl?: string
}): Promise<void> {
  await sendResendEmail({
    apiKey: options.apiKey,
    to: options.hostEmail,
    subject: `You cancelled ${options.listingTitle}`,
    html: hostSessionCancelledHtml({
      hostName: options.hostName,
      listingTitle: options.listingTitle,
      sessionDate: options.sessionDate,
      guestCount: options.guestCount,
      strikeCount: options.strikeCount,
      siteUrl: options.siteUrl,
    }),
  })
}

export function disputeRefundGuestSubject(listingTitle: string, refundAmountCents: number): string {
  return `Your ${formatCents(refundAmountCents)} refund for ${listingTitle}`
}

/**
 * Outcome of a guest dispute (admin-dispute-booking partial refund, or
 * admin-cancel-booking with reason 'dispute'). Never says the host cancelled.
 */
export function disputeRefundGuestHtml(options: {
  bookingReference: string
  listingTitle: string
  sessionDate: string
  refundAmountCents: number
  fullRefund: boolean
  paymentRail?: string | null
  guestName?: string | null
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  const refund = escapeHtml(formatCents(options.refundAmountCents))
  const method = escapeHtml(refundMethodNoun(options.paymentRail))
  const timing = escapeHtml(refundTimingCopy(options.paymentRail))
  const outcome = options.fullRefund
    ? `We've refunded your booking in full. ${refund} is on its way to your ${method}. ${timing}`
    : `We're refunding ${refund} to your ${method}. ${timing}`
  return wrapEmail(
    `
    <p style="margin:0 0 16px;">${emailGreeting(options.guestName)}</p>
    <p style="margin:0 0 16px;">Thanks for telling us what happened. We've reviewed your report about ${escapeHtml(options.listingTitle)}.</p>
    <p style="margin:0 0 16px;">${outcome}</p>
    <p style="margin:0 0 8px;"><strong>Listing:</strong> ${escapeHtml(options.listingTitle)}</p>
    <p style="margin:0 0 16px;"><strong>Date and time:</strong> ${escapeHtml(options.sessionDate)}</p>
    <p style="margin:0 0 16px;"><strong>Booking reference:</strong> ${escapeHtml(options.bookingReference)}</p>
    <p style="margin:0 0 16px;">Questions about this refund? Reply to this email.</p>
    <p style="margin:0;"><a href="${siteUrl}" style="${LINK_STYLE}">Browse other experiences</a></p>
    ${emailSignOff('take-care')}
    `,
    siteUrl,
  )
}

/** Never throws: a Resend failure must not undo a refund that already happened. */
export async function sendDisputeRefundEmail(options: {
  apiKey: string | undefined
  guestEmail: string | null | undefined
  bookingReference: string
  listingTitle: string
  sessionDate: string
  refundAmountCents: number
  fullRefund: boolean
  paymentRail?: string | null
  guestName?: string | null
  siteUrl?: string
}): Promise<void> {
  try {
    await sendResendEmail({
      apiKey: options.apiKey,
      to: options.guestEmail,
      subject: disputeRefundGuestSubject(options.listingTitle, options.refundAmountCents),
      replyTo: GUEST_REPLY_TO,
      html: disputeRefundGuestHtml(options),
    })
  } catch (err) {
    console.error('sendDisputeRefundEmail failed', err)
  }
}

export function complaintReceivedGuestSubject(listingTitle: string): string {
  return `We've received your report about ${listingTitle}`
}

export function complaintReceivedGuestHtml(options: {
  bookingReference: string
  listingTitle: string
  sessionDate: string
  guestName?: string | null
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  return wrapEmail(
    `
    <p style="margin:0 0 16px;">${emailGreeting(options.guestName)}</p>
    <p style="margin:0 0 16px;">Thanks for telling us what happened at ${escapeHtml(options.listingTitle)}. We'll look into it and reply by email within 2 business days.</p>
    <p style="margin:0 0 8px;"><strong>Listing:</strong> ${escapeHtml(options.listingTitle)}</p>
    <p style="margin:0 0 16px;"><strong>Date and time:</strong> ${escapeHtml(options.sessionDate)}</p>
    <p style="margin:0 0 16px;"><strong>Booking reference:</strong> ${escapeHtml(options.bookingReference)}</p>
    <p style="margin:0 0 16px;">Anything to add, such as more photos or messages? Reply to this email.</p>
    <p style="margin:0;"><a href="${siteUrl}/dispute-policy" style="${LINK_STYLE}">How we handle disputes</a></p>
    ${emailSignOff('take-care')}
    `,
    siteUrl,
  )
}

/** Ops inbox. The guest's words are untrusted, so everything is escaped. */
export function complaintOpsHtml(options: {
  bookingId: string
  bookingReference: string
  listingTitle: string
  sessionDate: string
  guestName: string
  guestEmail: string
  description: string
  photoPaths: string[]
  photoFailures: number
  payoutHeld: boolean
}): string {
  const photos = options.photoPaths.length
    ? `${options.photoPaths.length} in Storage bucket complaint-evidence: ${options.photoPaths.map(escapeHtml).join(', ')}`
    : 'None'
  const failures = options.photoFailures
    ? `<p><strong>${options.photoFailures} photo upload(s) failed.</strong> Ask the guest to reply with them.</p>`
    : ''
  const hold = options.payoutHeld
    ? 'Held automatically (payout_hold_reason = dispute).'
    : '<strong>Not held.</strong> The payout was already released, refunded, or already on hold. Check the booking.'
  return `
    <h2>Guest reported a problem: ${escapeHtml(options.bookingReference)}</h2>
    <p><strong>Listing:</strong> ${escapeHtml(options.listingTitle)}<br>
    <strong>Session:</strong> ${escapeHtml(options.sessionDate)}<br>
    <strong>Booking id:</strong> ${escapeHtml(options.bookingId)}<br>
    <strong>Guest:</strong> ${escapeHtml(options.guestName)} (${escapeHtml(options.guestEmail)})</p>
    <p><strong>What happened:</strong></p>
    <p style="white-space:pre-wrap;">${escapeHtml(options.description)}</p>
    <p><strong>Photos:</strong> ${photos}</p>
    ${failures}
    <p><strong>Payout:</strong> ${hold}</p>
    <p>Reply to the guest within 2 business days. Runbook: OPERATIONS.md, Guest dispute refund.</p>
  `
}

/** Never throws: the complaint is already saved and the payout already held. */
export async function sendComplaintEmails(options: {
  apiKey: string | undefined
  opsEmail: string
  guestEmail: string | null | undefined
  guestName?: string | null
  bookingId: string
  listingTitle: string
  sessionDate: string
  description: string
  photoPaths: string[]
  photoFailures: number
  payoutHeld: boolean
  siteUrl?: string
}): Promise<void> {
  const reference = bookingReference(options.bookingId)
  try {
    await sendResendEmail({
      apiKey: options.apiKey,
      to: options.opsEmail,
      subject: `Guest reported a problem: ${reference} ${options.listingTitle}`,
      replyTo: options.guestEmail || undefined,
      html: complaintOpsHtml({
        bookingId: options.bookingId,
        bookingReference: reference,
        listingTitle: options.listingTitle,
        sessionDate: options.sessionDate,
        guestName: options.guestName || 'Guest',
        guestEmail: options.guestEmail || 'unknown email',
        description: options.description,
        photoPaths: options.photoPaths,
        photoFailures: options.photoFailures,
        payoutHeld: options.payoutHeld,
      }),
    })
    await sendResendEmail({
      apiKey: options.apiKey,
      to: options.guestEmail,
      subject: complaintReceivedGuestSubject(options.listingTitle),
      replyTo: GUEST_REPLY_TO,
      html: complaintReceivedGuestHtml({
        bookingReference: reference,
        listingTitle: options.listingTitle,
        sessionDate: options.sessionDate,
        guestName: options.guestName,
        siteUrl: options.siteUrl,
      }),
    })
  } catch (err) {
    console.error('sendComplaintEmails failed', err)
  }
}

export function keenHostSubject(listingTitle: string, keenCount: number): string {
  return `${keenPeopleLine(keenCount)} on ${listingTitle}`
}

/**
 * To the host when guests tap "I'm keen" on a listing with no dates. Counts
 * and tallies only: the host never learns who asked.
 */
export function keenHostHtml(options: {
  hostName?: string | null
  listingTitle: string
  summary: InterestSummary
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  const { days, times } = interestTallies(options.summary)
  const groups = groupSizeRange(options.summary)
  const count = options.summary.keen_count
  const who = count === 1 ? 'Someone tapped' : `${count} people tapped`
  return wrapEmail(
    `
    <p style="margin:0 0 16px;">${emailGreeting(options.hostName)}</p>
    ${emailHeading(`${keenPeopleLine(count)} on ${options.listingTitle}`)}
    <p style="margin:0 0 20px;color:${EMAIL_COLORS.muted};">${escapeHtml(who)} "I'm keen" because your listing has no dates yet.</p>
    ${detailRows([
      ['Days', days ? escapeHtml(days) : ''],
      ['Times', times ? escapeHtml(times) : ''],
      ['Group size', groups ? escapeHtml(groups) : ''],
    ])}
    <p style="margin:0 0 8px;">Add a few dates and we'll email them the moment they open.</p>
    ${primaryButton(`${siteUrl}/hosting`, 'Add dates')}
    ${emailSignOff('see-you')}
    `,
    siteUrl,
    `${keenPeopleLine(count)} on ${options.listingTitle}. Add a date and we'll tell them.`,
  )
}

export function dateOpenedGuestSubject(hostName: string, listingTitle: string): string {
  return `${hostName || 'Your host'} just opened a date for ${listingTitle}`
}

/** To each guest who was keen, once, when the host adds sessions. */
export function dateOpenedGuestHtml(options: {
  guestName?: string | null
  hostName?: string | null
  listingTitle: string
  listingId: string
  sessionDates: string[]
  siteUrl?: string
}): string {
  const siteUrl = emailSiteUrl(options.siteUrl)
  const host = options.hostName || 'Your host'
  const dates = options.sessionDates.slice(0, 3)
  const more = options.sessionDates.length - dates.length
  const dateList = dates
    .map((date) => `<li style="margin:0 0 4px;">${escapeHtml(date)}</li>`)
    .join('')
  return wrapEmail(
    `
    <p style="margin:0 0 16px;">${emailGreeting(options.guestName)}</p>
    ${emailHeading(options.listingTitle)}
    <p style="margin:0 0 12px;">You were keen, so you're the first to know. ${escapeHtml(host)} just opened:</p>
    ${dateList ? `<ul style="margin:0 0 12px;padding-left:20px;">${dateList}</ul>` : ''}
    ${more > 0 ? `<p style="margin:0 0 12px;color:${EMAIL_COLORS.muted};">and ${more} more.</p>` : ''}
    <p style="margin:0 0 8px;">Spots are first come, first served.</p>
    ${primaryButton(`${siteUrl}/listings/${encodeURIComponent(options.listingId)}`, 'See dates and book')}
    <p style="margin:0;font-size:13px;color:${EMAIL_COLORS.muted};">You're getting this because you tapped "I'm keen" on this listing. We only send it once.</p>
    ${emailSignOff('see-you')}
    `,
    siteUrl,
    `${host} opened a date for ${options.listingTitle}`,
  )
}

/** Hosts see only their payout, never a guest's payment or refund. */
export function hostPayoutLine(cents: number): string {
  if (cents > 0) return `You'll receive ${formatCents(cents)}`
  return "You won't receive a payout for this booking"
}

/**
 * Guest always hears the refund amount, including $0. A guest-initiated cancel
 * also emails the host their payout only. Host-initiated session cancel uses
 * sendHostSessionCancelledEmail instead — never a guest amount.
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
  hostName?: string | null
  listingId?: string | null
  listingCategory?: string | null
  hasOtherSessions?: boolean
  paymentRail?: string | null
  guestsCount: number
  paymentMethod: string
  hostPayoutCents?: number
  siteUrl?: string
}): Promise<void> {
  try {
    const guestSubject = bookingCancelledGuestSubject({
      cancelledBy: options.cancelledBy,
      listingTitle: options.listingTitle,
      refundAmountCents: options.refundAmountCents,
      hostName: options.hostName,
    })
    await sendResendEmail({
      apiKey: options.apiKey,
      to: options.guestEmail,
      subject: guestSubject,
      replyTo: GUEST_REPLY_TO,
      html: bookingCancelledGuestHtml({
        bookingReference: options.bookingReference,
        listingTitle: options.listingTitle,
        sessionDate: options.sessionDate,
        refundAmountCents: options.refundAmountCents,
        cancelledBy: options.cancelledBy,
        guestsCount: options.guestsCount,
        paymentRail: options.paymentRail,
        paymentMethod: options.paymentMethod,
        guestName: options.guestName,
        hostName: options.hostName,
        listingId: options.listingId,
        listingCategory: options.listingCategory,
        hasOtherSessions: options.hasOtherSessions,
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
          hostName: options.hostName,
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

/** Hidden inbox preview text. Padded so clients do not pull body text in after it. */
function preheaderHtml(text?: string): string {
  if (!text) return ''
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(text)}${'&nbsp;&zwnj;'.repeat(40)}</div>`
}

/**
 * Every TryKai email. Table-based with inline styles so Gmail, iOS Mail and
 * Outlook render it the same: cream page, logo and wordmark, white card, then
 * the legal footer.
 */
function wrapEmail(body: string, siteUrl: string, preheader?: string): string {
  const base = emailSiteUrl(siteUrl)
  const c = EMAIL_COLORS
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>TryKai</title>
</head>
<body style="margin:0;padding:0;background:${c.cream};font-family:${FONT_STACK};color:${c.navy};-webkit-text-size-adjust:100%;">
  ${preheaderHtml(preheader)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.cream};">
    <tr>
      <td align="center" style="padding:24px 12px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 8px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;"><img src="${EMAIL_LOGO_URL}" width="36" height="36" alt="" style="display:block;border:0;width:36px;height:36px;"></td>
                  <td style="vertical-align:middle;font-family:${DISPLAY_STACK};font-size:22px;line-height:26px;font-weight:700;letter-spacing:-0.02em;color:${c.navy};">TryKai<span style="color:${c.coral};">.</span></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:${c.white};border:1px solid ${c.border};border-radius:16px;padding:28px 24px;font-size:16px;line-height:1.5;color:${c.navy};">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;font-size:13px;line-height:1.6;color:${c.muted};">
              TryKai<br>
              UEN 53526159D<br>
              <a href="${base}/terms" style="${QUIET_LINK_STYLE}">Terms</a>
              &nbsp;·&nbsp;
              <a href="${base}/privacy" style="${QUIET_LINK_STYLE}">Privacy</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
