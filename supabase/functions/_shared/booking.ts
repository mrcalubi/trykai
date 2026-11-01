/**
 * Booking money rules, kept free of Deno, Stripe and Supabase imports so they
 * can be exercised directly by the test suite. Anything that decides how much a
 * guest is charged or a host is paid belongs here rather than inline in a
 * request handler.
 */

export const CARD_FEE_RATE = 0.12
export const CARD_FEE_FLOOR_CENTS = 250

/**
 * PayNow off the card all-in total. Each tier is the largest whole percentage
 * that keeps PayNow at or above card after Stripe fees (card 3.4% + S$0.50,
 * PayNow 1.3%). `belowCents` is exclusive.
 */
export const PAYNOW_DISCOUNT_TIERS = [
  { belowCents: 2000, rate: 0.05 },
  { belowCents: 3000, rate: 0.04 },
  { belowCents: 6000, rate: 0.03 },
  { belowCents: Number.POSITIVE_INFINITY, rate: 0.02 },
] as const

/** Sliding PayNow rate for this card all-in total, in cents. */
export function paynowDiscountRate(cardTotalCents: number): number {
  for (const tier of PAYNOW_DISCOUNT_TIERS) {
    if (cardTotalCents < tier.belowCents) return tier.rate
  }
  return 0.02
}
/** Stripe will not refund PayNow after 90 days; 80 leaves a buffer. */
export const PAYNOW_MAX_DAYS_AHEAD = 80
export const PAYNOW_TOO_FAR_AHEAD = 'paynow_too_far_ahead'
export const PAYNOW_TOO_FAR_AHEAD_MESSAGE =
  `PayNow is available for sessions within ${PAYNOW_MAX_DAYS_AHEAD} days. Please pay by card.`
export const HOST_FEE_RATE = 0.1
export const HOST_FEE_FREE_BOOKINGS = 3
export const MAX_GUESTS_PER_BOOKING = 10
export const BOOKING_CUTOFF_HOURS = [3, 6, 12, 24, 48] as const
export const DEFAULT_BOOKING_CUTOFF_HOURS = 3

export function bookingCutoffHours(value: unknown): number {
  const hours = Number(value)
  return (BOOKING_CUTOFF_HOURS as readonly number[]).includes(hours)
    ? hours
    : DEFAULT_BOOKING_CUTOFF_HOURS
}

export function isBookingClosed(
  startsAt: string | Date | null | undefined,
  cutoffHours: unknown,
  now = Date.now(),
): boolean {
  const start = new Date(startsAt ?? '').getTime()
  if (Number.isNaN(start)) return false
  return now >= start - bookingCutoffHours(cutoffHours) * 60 * 60 * 1000
}

export function bookingClosedMessage(cutoffHours: unknown): string {
  return `Bookings for this session closed ${bookingCutoffHours(cutoffHours)} hours before it starts.`
}

/** 0 / 5 / 10 / 15 / 20 percent. Never more than 20. */
export function groupDiscountRate(
  guestsCount: number,
  groupPricing = true,
): number {
  if (!groupPricing || guestsCount <= 1) return 0
  if (guestsCount === 2) return 0.05
  if (guestsCount === 3) return 0.1
  if (guestsCount === 4) return 0.15
  return 0.2
}

export function discountedPerPersonCents(
  pricePerPerson: number,
  guestsCount: number,
  groupPricing = true,
): number {
  const rate = groupDiscountRate(guestsCount, groupPricing)
  return Math.round(pricePerPerson * (1 - rate))
}

/** Per-person after discount, times guests, in integer cents. */
export function discountedLessonCents(
  pricePerPerson: number,
  guestsCount: number,
  groupPricing = true,
): number {
  return (
    discountedPerPersonCents(pricePerPerson, guestsCount, groupPricing) *
    guestsCount
  )
}

export const PAYMENT_RAILS = ['card', 'paynow'] as const
export type PaymentRail = (typeof PAYMENT_RAILS)[number]

export interface BookingSession {
  spots_remaining: number
  starts_at?: string | Date | null
  listings?: {
    price_per_person?: number | null
    host_id?: string | null
    group_pricing?: boolean | null
    booking_cutoff_hours?: number | null
  } | null
}

export interface GuestCharge {
  lessonAmount: number
  totalAmount: number
  platformFee: number
}

export type BookingRejection = {
  ok: false
  status: number
  message: string
  code?: string
}

export type BookingAcceptance = GuestCharge & {
  ok: true
  guestsCount: number
  paymentRail: PaymentRail
}

export function isPaymentRail(value: unknown): value is PaymentRail {
  return value === 'card' || value === 'paynow'
}

export function roundUpToDollar(cents: number): number {
  return Math.ceil(cents / 100) * 100
}

/**
 * Guest unit price for a paid add-on. The host sets what they get, in whole
 * dollars. Guests pay that plus the 12% booking fee, rounded up to the next
 * whole dollar per unit. No S$2.50 floor — the lesson already carries it —
 * and there is never a host fee on add-ons.
 */
export function addonGuestUnitCents(hostCents: number): number {
  return roundUpToDollar(Math.round(hostCents * (1 + CARD_FEE_RATE)))
}

/**
 * Card path: 12% of the lesson with a S$2.50 floor, then the all-in total is
 * rounded UP to the next whole dollar. PayNow takes `paynowDiscountRate` off
 * that same all-in total. `platformFee` is always `totalAmount - lessonAmount`
 * so cancellation maths that treat the lesson as `total - platform_fee` stay
 * correct.
 */
export function calculateGuestCharge(
  lessonCents: number,
  rail: PaymentRail = 'card',
): GuestCharge {
  const cardFee = Math.max(
    Math.round(lessonCents * CARD_FEE_RATE),
    CARD_FEE_FLOOR_CENTS,
  )
  const cardTotal = roundUpToDollar(lessonCents + cardFee)

  if (rail === 'paynow') {
    const totalAmount = Math.round(cardTotal * (1 - paynowDiscountRate(cardTotal)))
    return {
      lessonAmount: lessonCents,
      totalAmount,
      platformFee: totalAmount - lessonCents,
    }
  }

  return {
    lessonAmount: lessonCents,
    totalAmount: cardTotal,
    platformFee: cardTotal - lessonCents,
  }
}

export function calculateHostFee(options: {
  isFoundingHost: boolean
  priorConfirmedCount: number
  lessonAmount: number
}): number {
  if (options.isFoundingHost) return 0
  if (options.priorConfirmedCount < HOST_FEE_FREE_BOOKINGS) return 0
  return Math.round(options.lessonAmount * HOST_FEE_RATE)
}

export function calculateHostPayout(lessonAmount: number, hostFee: number): number {
  return lessonAmount - hostFee
}

export type BookingAddonLine = {
  hostUnitCents: number
  quantity: number
}

export type BookingCharge = GuestCharge & {
  addonsAmount: number
  addonsGuestCents: number
  cardLessonTotal: number
}

/**
 * Lesson card total stays as today (12%, S$2.50 floor, round up). Add-ons
 * sit on top at their own 12% (no floor). PayNow discounts the combined
 * card total. Hosts keep every add-on dollar; the platform fee is
 * total − lesson − addons.
 */
export function calculateBookingCharge(options: {
  lessonCents: number
  addons?: BookingAddonLine[]
  rail: PaymentRail
}): BookingCharge {
  const addons = options.addons ?? []
  const lesson = calculateGuestCharge(options.lessonCents, 'card')
  const cardLessonTotal = lesson.totalAmount
  const addonsGuestCents = addons.reduce(
    (sum, line) => sum + addonGuestUnitCents(line.hostUnitCents) * line.quantity,
    0,
  )
  const addonsAmount = addons.reduce(
    (sum, line) => sum + line.hostUnitCents * line.quantity,
    0,
  )
  const cardTotal = cardLessonTotal + addonsGuestCents
  const totalAmount =
    options.rail === 'card'
      ? cardTotal
      : Math.round(cardTotal * (1 - paynowDiscountRate(cardTotal)))
  return {
    lessonAmount: options.lessonCents,
    addonsAmount,
    addonsGuestCents,
    cardLessonTotal,
    totalAmount,
    platformFee: totalAmount - options.lessonCents - addonsAmount,
  }
}

/**
 * The host fee is on the lesson only. Add-ons pass through in full.
 * lesson = total − platform_fee − addons_amount
 */
export function hostPayoutBreakdown(options: {
  totalAmount: number
  platformFee: number
  addonsAmount?: number | null
  isFoundingHost: boolean
  priorConfirmedCount: number
}): { lessonAmount: number; hostFee: number; hostPayoutAmount: number } {
  const addonsAmount = Number(options.addonsAmount) || 0
  const lessonAmount = options.totalAmount - options.platformFee - addonsAmount
  const hostFee = calculateHostFee({
    isFoundingHost: options.isFoundingHost,
    priorConfirmedCount: options.priorConfirmedCount,
    lessonAmount,
  })
  return {
    lessonAmount,
    hostFee,
    hostPayoutAmount: calculateHostPayout(lessonAmount, hostFee) + addonsAmount,
  }
}

export const ADDON_NOTE_MAX = 120
export const MAX_BOOKING_ADDON_LINES = 3

export type CatalogAddon = {
  id: string
  name: string
  unit: 'person' | 'booking'
  price_cents: number
  session_limit?: number | null
  is_active?: boolean
}

export type PreparedAddonLine = {
  id: string
  name: string
  unit: 'person' | 'booking'
  quantity: number
  hostUnitCents: number
  guestUnitCents: number
}

export function parseAddonNote(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, ADDON_NOTE_MAX)
  return trimmed || null
}

export function prepareCheckoutAddons(options: {
  requested: unknown
  catalog: CatalogAddon[]
  guestsCount: number
  remainingByAddon?: Record<string, number>
}):
  | { ok: true; lines: PreparedAddonLine[] }
  | { ok: false; status: number; message: string } {
  const requested = Array.isArray(options.requested) ? options.requested : []
  const byId = new Map(options.catalog.filter((row) => row.is_active !== false).map((row) => [row.id, row]))
  const lines: PreparedAddonLine[] = []

  for (const item of requested) {
    const raw = item as { id?: unknown; quantity?: unknown }
    const id = typeof raw.id === 'string' ? raw.id : ''
    const quantity = raw.quantity
    if (!id) {
      return {
        ok: false,
        status: 400,
        message: 'That add-on is no longer available. Refresh and try again.',
      }
    }
    if (quantity === 0 || quantity === '0') continue
    if (!Number.isInteger(quantity) || (quantity as number) < 1) {
      return { ok: false, status: 400, message: 'Choose a whole number of each add-on.' }
    }
    const catalog = byId.get(id)
    if (!catalog) {
      return {
        ok: false,
        status: 400,
        message: 'That add-on is no longer available. Refresh and try again.',
      }
    }
    if (catalog.unit === 'booking' && quantity !== 1) {
      return { ok: false, status: 400, message: 'That add-on is once per booking.' }
    }
    if (catalog.unit === 'person' && (quantity as number) > options.guestsCount) {
      return {
        ok: false,
        status: 400,
        message: `You can add ${catalog.name} for at most ${options.guestsCount} of you.`,
      }
    }
    const remaining = options.remainingByAddon?.[id]
    if (remaining != null && (quantity as number) > remaining) {
      return {
        ok: false,
        status: 400,
        message: `Only ${remaining} ${catalog.name} left for this session.`,
      }
    }
    lines.push({
      id: catalog.id,
      name: catalog.name,
      unit: catalog.unit,
      quantity: quantity as number,
      hostUnitCents: catalog.price_cents,
      guestUnitCents: addonGuestUnitCents(catalog.price_cents),
    })
  }

  if (lines.length > MAX_BOOKING_ADDON_LINES) {
    return { ok: false, status: 400, message: 'You can pick up to 3 add-ons.' }
  }

  return { ok: true, lines }
}

/**
 * What the host still receives after a guest cancel. The guest refund is taken
 * out of the frozen payout; a full refund (or any refund larger than the
 * payout) leaves nothing. Hosts are shown only this remainder, never the
 * guest's payment or refund.
 */
export function hostPayoutAfterGuestCancel(
  originalHostPayoutCents: number,
  guestRefundCents: number,
): number {
  const payout = Number(originalHostPayoutCents)
  const refund = Number(guestRefundCents)
  if (!Number.isFinite(payout) || payout <= 0) return 0
  if (!Number.isFinite(refund) || refund <= 0) return Math.round(payout)
  return Math.max(0, Math.round(payout) - Math.round(refund))
}

export function nextHostStrikeState(currentStrikes: number | null | undefined): {
  hostStrikes: number
  deactivateListings: boolean
} {
  const hostStrikes = (currentStrikes ?? 0) + 1
  return { hostStrikes, deactivateListings: hostStrikes >= 3 }
}

/** Pending bookings never took a spot; only confirmed ones give it back. */
export function spotsToRestore(status: string, guestsCount: number): number {
  if (status !== 'confirmed') return 0
  return guestsCount
}

/** Checkout created the row before Stripe captured anything. */
export function isUnpaidCheckout(status: string): boolean {
  return status === 'pending'
}

export function unpaidCheckoutCancelPatch(cancelledBy: 'guest' | 'host' = 'guest') {
  return {
    status: 'cancelled' as const,
    cancelled_by: cancelledBy,
    cancelled_at: new Date().toISOString(),
    refund_amount: 0,
  }
}

/** Guest cancel of a never-paid row is not a booking cancel. */
export function guestCancelDecision(status: string): {
  allow: boolean
  status?: number
  message?: string
} {
  if (isUnpaidCheckout(status)) {
    return {
      allow: false,
      status: 400,
      message: 'This checkout was never paid',
    }
  }
  if (status !== 'confirmed') {
    return { allow: false, status: 400, message: 'Booking cannot be cancelled' }
  }
  return { allow: true }
}

export function shouldEmailCancellation(status: string): boolean {
  return status === 'confirmed'
}

export function abandonCheckoutAuthorized(
  callerId: string | null | undefined,
  guestId: string | null | undefined,
): boolean {
  return Boolean(callerId) && Boolean(guestId) && callerId === guestId
}

export function paymentIntentAlreadyCaptured(status: string | null | undefined): boolean {
  return status === 'succeeded' || status === 'processing'
}

export type AbandonCheckoutDecision =
  | { httpStatus: 403; error: 'Forbidden' }
  | { abandon: false; reason: 'not_pending' | 'payment_succeeded' }
  | { abandon: true }

export function decideAbandonCheckout(options: {
  callerId: string | null | undefined
  guestId: string | null | undefined
  bookingStatus: string
  intentStatus?: string | null
}): AbandonCheckoutDecision {
  if (!abandonCheckoutAuthorized(options.callerId, options.guestId)) {
    return { httpStatus: 403, error: 'Forbidden' }
  }
  if (!isUnpaidCheckout(options.bookingStatus)) {
    return { abandon: false, reason: 'not_pending' }
  }
  if (paymentIntentAlreadyCaptured(options.intentStatus)) {
    return { abandon: false, reason: 'payment_succeeded' }
  }
  return { abandon: true }
}

/**
 * A guest count arrives from the request body, so it has to be treated as
 * untrusted. A fractional value would otherwise pass the spots check and buy a
 * session at a fraction of its price.
 */
export function isValidGuestsCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_GUESTS_PER_BOOKING
  )
}

/**
 * A host booking their own session would pay themselves through the platform:
 * the guest charge lands in TryKai's balance and the 72h Transfer sends the
 * host share straight back, so the only real movement is Stripe's processing
 * fee out of TryKai. It also takes a spot off their own listing.
 */
export function isHostBookingOwnListing(
  session: BookingSession | null | undefined,
  guestId: string | null | undefined,
): boolean {
  const hostId = session?.listings?.host_id
  if (!hostId || !guestId) return false
  return hostId === guestId
}

export function prepareBooking(
  session: BookingSession | null | undefined,
  guestsCount: unknown,
  paymentRail: unknown = 'card',
  guestId?: string | null,
): BookingAcceptance | BookingRejection {
  if (!session) {
    return { ok: false, status: 404, message: 'Session not found' }
  }

  if (isHostBookingOwnListing(session, guestId)) {
    return {
      ok: false,
      status: 403,
      message: 'You cannot book your own listing.',
    }
  }

  if (!isValidGuestsCount(guestsCount)) {
    return { ok: false, status: 400, message: 'Invalid guest count' }
  }

  if (!isPaymentRail(paymentRail)) {
    return { ok: false, status: 400, message: 'Invalid payment method' }
  }

  const payNowWindow = rejectPayNowIfTooFarAhead(paymentRail, session.starts_at)
  if (payNowWindow) return payNowWindow

  if (isBookingClosed(session.starts_at, session.listings?.booking_cutoff_hours)) {
    return {
      ok: false,
      status: 400,
      message: bookingClosedMessage(session.listings?.booking_cutoff_hours),
    }
  }

  if (session.spots_remaining < guestsCount) {
    return { ok: false, status: 400, message: 'Not enough spots' }
  }

  const pricePerPerson = session.listings?.price_per_person
  if (
    typeof pricePerPerson !== 'number' ||
    !Number.isFinite(pricePerPerson) ||
    pricePerPerson <= 0
  ) {
    return { ok: false, status: 400, message: 'Listing price unavailable' }
  }

  const groupPricing = session.listings?.group_pricing !== false
  const lessonAmount = discountedLessonCents(pricePerPerson, guestsCount, groupPricing)
  const charge = calculateGuestCharge(lessonAmount, paymentRail)

  return {
    ok: true,
    guestsCount,
    paymentRail,
    ...charge,
  }
}

/** Fallback only for bookings taken before platform_fee was stored. */
export const LEGACY_PLATFORM_FEE_RATE = 0.15

/**
 * The published Cancellation Policy tiers; these decide the actual Stripe
 * refund. GUEST_REFUND_TIERS in src/lib/cancellationPolicy.js mirrors them to
 * preview the refund before the guest confirms, and
 * src/pages/CancellationPolicy.jsx states them. Change all three together.
 */
export const GUEST_REFUND_TIER_RULES = [
  { id: 'full', minHoursBefore: 48, lessonFeeShare: 1, refundsPlatformFee: false },
  { id: 'half', minHoursBefore: 24, lessonFeeShare: 0.5, refundsPlatformFee: false },
  { id: 'quarter', minHoursBefore: 6, lessonFeeShare: 0.25, refundsPlatformFee: false },
  { id: 'none', minHoursBefore: Number.NEGATIVE_INFINITY, lessonFeeShare: 0, refundsPlatformFee: false },
] as const

export function hoursUntilSession(sessionStartsAt: string | Date, now = Date.now()): number {
  return (new Date(sessionStartsAt).getTime() - now) / (1000 * 60 * 60)
}

/**
 * PayNow refunds expire 90 days after payment. Sessions more than 80 days
 * out can still be booked on card.
 */
export function isPayNowTooFarAhead(
  startsAt: string | Date | null | undefined,
  now = Date.now(),
): boolean {
  if (startsAt == null || startsAt === '') return false
  const start = new Date(startsAt).getTime()
  if (!Number.isFinite(start)) return false
  return hoursUntilSession(startsAt, now) > PAYNOW_MAX_DAYS_AHEAD * 24
}

export function rejectPayNowIfTooFarAhead(
  paymentRail: unknown,
  startsAt: string | Date | null | undefined,
  now = Date.now(),
): BookingRejection | null {
  if (paymentRail !== 'paynow' || !isPayNowTooFarAhead(startsAt, now)) return null
  return {
    ok: false,
    status: 400,
    message: PAYNOW_TOO_FAR_AHEAD_MESSAGE,
    code: PAYNOW_TOO_FAR_AHEAD,
  }
}

export function guestRefundTierRule(sessionStartsAt: string | Date, now = Date.now()) {
  const hoursUntil = hoursUntilSession(sessionStartsAt, now)
  return GUEST_REFUND_TIER_RULES.find((tier) => hoursUntil >= tier.minHoursBefore)!
}

function platformFeeOf(
  totalAmountCents: number,
  platformFeeCents: number | null | undefined,
): number {
  return Number.isFinite(platformFeeCents as number)
    ? (platformFeeCents as number)
    : Math.round(totalAmountCents * LEGACY_PLATFORM_FEE_RATE)
}

export function calculateGuestRefund(
  totalAmountCents: number,
  sessionStartsAt: string | Date,
  platformFeeCents?: number | null,
  now = Date.now(),
): number {
  const tier = guestRefundTierRule(sessionStartsAt, now)
  if (tier.lessonFeeShare === 0) return 0
  const lessonFee = totalAmountCents - platformFeeOf(totalAmountCents, platformFeeCents)
  return Math.round(lessonFee * tier.lessonFeeShare)
}

export function rescheduleErrorMessage(message: string | undefined): string {
  const text = (message ?? '').toLowerCase()
  if (text.includes('already rescheduled')) return "You've already moved this booking once."
  if (text.includes('too late to reschedule')) return 'Moving closes 48 hours before the session.'
  if (text.includes('insufficient add-ons')) return "There aren't enough of your extras left on that date."
  if (text.includes('insufficient spots')) return 'Not enough spots left on that date.'
  if (text.includes('paynow window')) {
    return 'PayNow bookings can only move to a date within 80 days of when you paid.'
  }
  if (text.includes('bookings closed')) {
    const hours = Number(text.match(/(\d+)\s*hours/)?.[1])
    return bookingClosedMessage(Number.isFinite(hours) ? hours : DEFAULT_BOOKING_CUTOFF_HOURS)
  }
  if (text.includes('not allowed')) return 'Not allowed'
  if (text.includes('booking not found')) return 'Booking not found'
  return "That date isn't available any more."
}

export function confirmRpcErrorKind(message: string | undefined): 'oversell' | 'other' {
  const text = (message ?? '').toLowerCase()
  if (
    text.includes('insufficient spots') ||
    text.includes('session not open') ||
    text.includes('insufficient add-ons')
  ) {
    return 'oversell'
  }
  return 'other'
}

/**
 * Pending rows never captured funds through us, so there is nothing to refund.
 * Host/admin cancels repay the whole charge; guest cancels follow the published
 * four-tier table.
 */
export function refundAmountForCancel(options: {
  status: string
  cancelledBy: 'guest' | 'host' | 'admin'
  totalAmount: number
  platformFee?: number | null
  sessionStartsAt: string | Date
  now?: number
}): number {
  if (options.status !== 'confirmed') return 0
  if (options.cancelledBy === 'guest') {
    return calculateGuestRefund(
      options.totalAmount,
      options.sessionStartsAt,
      options.platformFee,
      options.now,
    )
  }
  return options.totalAmount
}

export function paymentIntentCreateParams(options: {
  amount: number
  bookingId: string
  sessionId: string
  guestId: string
  guestsCount: number
  paymentRail: PaymentRail
  platformFee: number
  addonsAmount?: number
}): {
  amount: number
  currency: 'sgd'
  payment_method_types: string[]
  transfer_group: string
  metadata: Record<string, string>
} {
  return {
    amount: options.amount,
    currency: 'sgd',
    payment_method_types: [options.paymentRail],
    transfer_group: options.bookingId,
    metadata: {
      booking_id: options.bookingId,
      session_id: options.sessionId,
      guest_id: options.guestId,
      guests_count: String(options.guestsCount),
      payment_rail: options.paymentRail,
      platform_fee: String(options.platformFee),
      addons_amount: String(options.addonsAmount ?? 0),
    },
  }
}
