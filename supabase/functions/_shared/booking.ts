/**
 * Booking money rules, kept free of Deno, Stripe and Supabase imports so they
 * can be exercised directly by the test suite. Anything that decides how much a
 * guest is charged or a host is paid belongs here rather than inline in a
 * request handler.
 */

export const CARD_FEE_RATE = 0.12
export const CARD_FEE_FLOOR_CENTS = 250
export const PAYNOW_DISCOUNT_RATE = 0.05
export const HOST_FEE_RATE = 0.1
export const HOST_FEE_FREE_BOOKINGS = 3
export const MAX_GUESTS_PER_BOOKING = 10

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
  listings?: {
    price_per_person?: number | null
    host_id?: string | null
    group_pricing?: boolean | null
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
 * Card path: 12% of the lesson with a S$2.50 floor, then the all-in total is
 * rounded UP to the next whole dollar. PayNow is 5% off that same all-in total.
 * `platformFee` is always `totalAmount - lessonAmount` so cancellation maths
 * that treat the lesson as `total - platform_fee` stay correct.
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
    const totalAmount = Math.round(cardTotal * (1 - PAYNOW_DISCOUNT_RATE))
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
 * the guest charge lands in TryKai's balance and the 24h Transfer sends the
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

export const GUEST_REFUND_TIER_RULES = [
  { id: 'full', minHoursBefore: 48, lessonFeeShare: 1, refundsPlatformFee: true },
  { id: 'half', minHoursBefore: 24, lessonFeeShare: 0.5, refundsPlatformFee: false },
  { id: 'quarter', minHoursBefore: 6, lessonFeeShare: 0.25, refundsPlatformFee: false },
  { id: 'none', minHoursBefore: Number.NEGATIVE_INFINITY, lessonFeeShare: 0, refundsPlatformFee: false },
] as const

export function hoursUntilSession(sessionStartsAt: string | Date, now = Date.now()): number {
  return (new Date(sessionStartsAt).getTime() - now) / (1000 * 60 * 60)
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
  if (tier.refundsPlatformFee) return totalAmountCents
  if (tier.lessonFeeShare === 0) return 0
  const lessonFee = totalAmountCents - platformFeeOf(totalAmountCents, platformFeeCents)
  return Math.round(lessonFee * tier.lessonFeeShare)
}

export function confirmRpcErrorKind(message: string | undefined): 'oversell' | 'other' {
  const text = (message ?? '').toLowerCase()
  if (text.includes('insufficient spots') || text.includes('session not open')) {
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
    },
  }
}
