import { describe, expect, it } from 'vitest'
import {
  CARD_FEE_FLOOR_CENTS,
  CARD_FEE_RATE,
  HOST_FEE_FREE_BOOKINGS,
  HOST_FEE_RATE,
  LEGACY_PLATFORM_FEE_RATE,
  PAYNOW_DISCOUNT_TIERS,
  PAYNOW_MAX_DAYS_AHEAD,
  PAYNOW_TOO_FAR_AHEAD,
  PAYNOW_TOO_FAR_AHEAD_MESSAGE,
  isPayNowTooFarAhead,
  paynowDiscountRate,
  rejectPayNowIfTooFarAhead,
  calculateBookingCharge,
  calculateGuestCharge,
  GUEST_REFUND_TIER_RULES,
  calculateGuestRefund,
  calculateHostFee,
  calculateHostPayout,
  hostPayoutBreakdown,
  parseAddonNote,
  prepareCheckoutAddons,
  hostPayoutAfterGuestCancel,
  confirmRpcErrorKind,
  rescheduleErrorMessage,
  decideAbandonCheckout,
  guestCancelDecision,
  discountedLessonCents,
  discountedPerPersonCents,
  groupDiscountRate,
  MAX_GUESTS_PER_BOOKING,
  isPaymentRail,
  isValidGuestsCount,
  nextHostStrikeState,
  paymentIntentCreateParams,
  isHostBookingOwnListing,
  prepareBooking,
  refundAmountForCancel,
  shouldEmailCancellation,
  unpaidCheckoutCancelPatch,
  roundUpToDollar,
  addonGuestUnitCents,
  spotsToRestore,
} from './booking.ts'

function sessionWith(overrides: Record<string, unknown> = {}) {
  return {
    spots_remaining: 4,
    listings: { price_per_person: 2500, host_id: 'host-1' },
    ...overrides,
  }
}

describe('calculateGuestCharge card path', () => {
  it('matches the published all-in totals across the S$10 to S$40 band', () => {
    expect(calculateGuestCharge(1000, 'card').totalAmount).toBe(1300)
    expect(calculateGuestCharge(2000, 'card').totalAmount).toBe(2300)
    expect(calculateGuestCharge(2500, 'card').totalAmount).toBe(2800)
    expect(calculateGuestCharge(3000, 'card').totalAmount).toBe(3400)
    expect(calculateGuestCharge(4000, 'card').totalAmount).toBe(4500)
  })

  it('uses a 12% fee when that is above the S$2.50 floor', () => {
    expect(CARD_FEE_RATE).toBe(0.12)
    const charge = calculateGuestCharge(2500, 'card')
    expect(charge.lessonAmount).toBe(2500)
    expect(charge.platformFee).toBe(300)
    expect(charge.totalAmount).toBe(2800)
  })

  it('applies the S$2.50 floor on cheap lessons before rounding the total up', () => {
    expect(CARD_FEE_FLOOR_CENTS).toBe(250)
    const ten = calculateGuestCharge(1000, 'card')
    expect(ten.platformFee).toBe(300)
    expect(ten.totalAmount).toBe(1300)

    const twenty = calculateGuestCharge(2000, 'card')
    expect(twenty.platformFee).toBe(300)
    expect(twenty.totalAmount).toBe(2300)
  })

  it('rounds the all-in total UP to the next whole dollar', () => {
    // 12% of 3000 is 360, 3360 ceils to 3400.
    expect(roundUpToDollar(3360)).toBe(3400)
    expect(calculateGuestCharge(3000, 'card').totalAmount).toBe(3400)
  })

  it('prices an add-on unit at 12% with no S$2.50 floor, rounded up per unit', () => {
    expect(addonGuestUnitCents(100)).toBe(200)
    expect(addonGuestUnitCents(800)).toBe(900)
    expect(addonGuestUnitCents(1500)).toBe(1700)
    expect(addonGuestUnitCents(2500)).toBe(2800)
    expect(addonGuestUnitCents(5000)).toBe(5600)
  })

  it('stores the platform fee as the gap between the all-in total and the lesson', () => {
    for (const price of [1000, 2000, 2500, 3000, 4000, 4500, 1999]) {
      const charge = calculateGuestCharge(price, 'card')
      expect(charge.platformFee + charge.lessonAmount).toBe(charge.totalAmount)
      expect(charge.totalAmount % 100).toBe(0)
    }
  })

  it('scales the lesson with guest count before applying the fee', () => {
    const one = calculateGuestCharge(2500, 'card')
    const two = calculateGuestCharge(5000, 'card')
    expect(two.lessonAmount).toBe(one.lessonAmount * 2)
    expect(two.totalAmount).toBeGreaterThan(one.totalAmount)
  })
})

describe('calculateGuestCharge PayNow path', () => {
  it('steps the rate down as the card total grows', () => {
    expect(PAYNOW_DISCOUNT_TIERS.map((tier) => [tier.belowCents, tier.rate])).toEqual([
      [2000, 0.05],
      [3000, 0.04],
      [6000, 0.03],
      [Number.POSITIVE_INFINITY, 0.02],
    ])
    expect(paynowDiscountRate(1900)).toBe(0.05)
    expect(paynowDiscountRate(2000)).toBe(0.04)
    expect(paynowDiscountRate(2900)).toBe(0.04)
    expect(paynowDiscountRate(3000)).toBe(0.03)
    expect(paynowDiscountRate(5900)).toBe(0.03)
    expect(paynowDiscountRate(6000)).toBe(0.02)
    expect(paynowDiscountRate(Number.NaN)).toBe(0.02)
  })

  it('matches the published PayNow totals across the S$10 to S$40 band', () => {
    expect(calculateGuestCharge(1000, 'card').totalAmount).toBe(1300)
    expect(calculateGuestCharge(1000, 'paynow').totalAmount).toBe(1235)
    expect(calculateGuestCharge(2000, 'card').totalAmount).toBe(2300)
    expect(calculateGuestCharge(2000, 'paynow').totalAmount).toBe(2208)
    expect(calculateGuestCharge(2500, 'card').totalAmount).toBe(2800)
    expect(calculateGuestCharge(2500, 'paynow').totalAmount).toBe(2688)
    expect(calculateGuestCharge(3000, 'card').totalAmount).toBe(3400)
    expect(calculateGuestCharge(3000, 'paynow').totalAmount).toBe(3298)
    expect(calculateGuestCharge(4000, 'card').totalAmount).toBe(4500)
    expect(calculateGuestCharge(4000, 'paynow').totalAmount).toBe(4365)
  })

  it('uses 2% once a two-guest $30 booking crosses $60', () => {
    const lesson = discountedLessonCents(3000, 2, true)
    expect(calculateGuestCharge(lesson, 'card').totalAmount).toBe(6400)
    expect(calculateGuestCharge(lesson, 'paynow').totalAmount).toBe(6272)
  })

  it('is cheaper than card at every published price point, never more expensive', () => {
    for (const price of [1000, 2000, 2500, 3000, 4000]) {
      const card = calculateGuestCharge(price, 'card')
      const paynow = calculateGuestCharge(price, 'paynow')
      expect(paynow.totalAmount).toBeLessThan(card.totalAmount)
      expect(paynow.lessonAmount).toBe(card.lessonAmount)
      expect(paynow.platformFee + paynow.lessonAmount).toBe(paynow.totalAmount)
    }
  })

  it('defaults to the card rail', () => {
    expect(calculateGuestCharge(2500)).toEqual(calculateGuestCharge(2500, 'card'))
  })
})

describe('calculateHostFee', () => {
  it('is never charged to a founding host', () => {
    expect(
      calculateHostFee({ isFoundingHost: true, priorConfirmedCount: 99, lessonAmount: 2500 }),
    ).toBe(0)
  })

  it('waives the first three confirmed bookings for everyone else', () => {
    expect(HOST_FEE_FREE_BOOKINGS).toBe(3)
    for (const prior of [0, 1, 2]) {
      expect(
        calculateHostFee({ isFoundingHost: false, priorConfirmedCount: prior, lessonAmount: 2500 }),
      ).toBe(0)
    }
  })

  it('takes 10% of the lesson from the fourth booking onward', () => {
    expect(HOST_FEE_RATE).toBe(0.1)
    expect(
      calculateHostFee({ isFoundingHost: false, priorConfirmedCount: 3, lessonAmount: 2500 }),
    ).toBe(250)
  })

  it('leaves the host payout as the lesson minus that fee', () => {
    const lesson = 2500
    const fee = calculateHostFee({
      isFoundingHost: false,
      priorConfirmedCount: 3,
      lessonAmount: lesson,
    })
    expect(calculateHostPayout(lesson, fee)).toBe(2250)
    expect(calculateHostPayout(lesson, 0)).toBe(2500)
  })

  it('cuts the host payout by the guest refund and never below zero', () => {
    expect(hostPayoutAfterGuestCancel(8500, 0)).toBe(8500)
    expect(hostPayoutAfterGuestCancel(8500, 4250)).toBe(4250)
    expect(hostPayoutAfterGuestCancel(8500, 9600)).toBe(0)
    expect(hostPayoutAfterGuestCancel(0, 2800)).toBe(0)
    expect(hostPayoutAfterGuestCancel(Number.NaN, 100)).toBe(0)
  })

  it('still leaves the host with 0 after a 48h+ guest cancel', () => {
    const now = new Date('2026-06-15T10:00:00.000Z').getTime()
    const starts = new Date(now + 72 * 60 * 60 * 1000).toISOString()
    const card = calculateBookingCharge({ lessonCents: 2500, rail: 'card' })
    const refund = calculateGuestRefund(card.totalAmount, starts, card.platformFee, now)
    expect(refund).toBe(2500)
    expect(hostPayoutAfterGuestCancel(2500, refund)).toBe(0)
    expect(hostPayoutAfterGuestCancel(2250, refund)).toBe(0)

    const withAddons = calculateBookingCharge({
      lessonCents: 2500,
      addons: [{ hostUnitCents: 1500, quantity: 1 }],
      rail: 'card',
    })
    const addonRefund = calculateGuestRefund(
      withAddons.totalAmount,
      starts,
      withAddons.platformFee,
      now,
    )
    expect(addonRefund).toBe(4000)
    expect(hostPayoutAfterGuestCancel(4000, addonRefund)).toBe(0)
  })
})

describe('nextHostStrikeState', () => {
  it('increments from zero and deactivates on the third strike', () => {
    expect(nextHostStrikeState(0)).toEqual({ hostStrikes: 1, deactivateListings: false })
    expect(nextHostStrikeState(1)).toEqual({ hostStrikes: 2, deactivateListings: false })
    expect(nextHostStrikeState(2)).toEqual({ hostStrikes: 3, deactivateListings: true })
  })

  it('treats a missing strike record as zero', () => {
    expect(nextHostStrikeState(null)).toEqual({ hostStrikes: 1, deactivateListings: false })
    expect(nextHostStrikeState(undefined)).toEqual({ hostStrikes: 1, deactivateListings: false })
  })
})

describe('spotsToRestore', () => {
  it('returns the guest count only for a confirmed booking', () => {
    expect(spotsToRestore('confirmed', 2)).toBe(2)
    expect(spotsToRestore('pending', 2)).toBe(0)
    expect(spotsToRestore('cancelled', 1)).toBe(0)
  })
})

describe('PayNow 80-day window', () => {
  const now = Date.parse('2026-10-17T00:00:00.000Z')
  const daysAhead = (days: number) =>
    new Date(now + days * 24 * 60 * 60 * 1000).toISOString()

  it('exports the 80-day buffer', () => {
    expect(PAYNOW_MAX_DAYS_AHEAD).toBe(80)
  })

  it('allows PayNow at 79 and 80 days and blocks 81', () => {
    expect(isPayNowTooFarAhead(daysAhead(79), now)).toBe(false)
    expect(isPayNowTooFarAhead(daysAhead(80), now)).toBe(false)
    expect(isPayNowTooFarAhead(daysAhead(81), now)).toBe(true)
  })

  it('does not block when the start time is missing or invalid', () => {
    expect(isPayNowTooFarAhead(null, now)).toBe(false)
    expect(isPayNowTooFarAhead('', now)).toBe(false)
    expect(isPayNowTooFarAhead('not-a-date', now)).toBe(false)
  })

  it('rejects PayNow on the edge function when the session is 81 days out', () => {
    expect(rejectPayNowIfTooFarAhead('paynow', daysAhead(81), now)).toEqual({
      ok: false,
      status: 400,
      message: PAYNOW_TOO_FAR_AHEAD_MESSAGE,
      code: PAYNOW_TOO_FAR_AHEAD,
    })
    expect(rejectPayNowIfTooFarAhead('paynow', daysAhead(80), now)).toBeNull()
    expect(rejectPayNowIfTooFarAhead('card', daysAhead(81), now)).toBeNull()
  })

  it('lets prepareBooking refuse PayNow past the window and still accept card', () => {
    const liveAhead = (days: number) =>
      new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    expect(prepareBooking(sessionWith({ starts_at: liveAhead(81) }), 1, 'paynow')).toEqual({
      ok: false,
      status: 400,
      message: PAYNOW_TOO_FAR_AHEAD_MESSAGE,
      code: PAYNOW_TOO_FAR_AHEAD,
    })
    expect(prepareBooking(sessionWith({ starts_at: liveAhead(80) }), 1, 'paynow').ok).toBe(true)
    expect(prepareBooking(sessionWith({ starts_at: liveAhead(81) }), 1, 'card').ok).toBe(true)
  })
})

describe('isPaymentRail', () => {
  it('accepts the two rails guests can choose at checkout', () => {
    expect(isPaymentRail('card')).toBe(true)
    expect(isPaymentRail('paynow')).toBe(true)
  })

  it('rejects anything else', () => {
    for (const value of ['grabpay', 'Card', '', null, undefined, 1]) {
      expect(isPaymentRail(value)).toBe(false)
    }
  })
})

describe('isValidGuestsCount', () => {
  it('accepts positive whole numbers', () => {
    expect(isValidGuestsCount(1)).toBe(true)
    expect(isValidGuestsCount(10)).toBe(true)
  })

  it('rejects anything that is not a positive whole number', () => {
    for (const value of [0, -1, 0.5, 1.5, NaN, Infinity, null, undefined, '2', {}, []]) {
      expect(isValidGuestsCount(value)).toBe(false)
    }
  })
})

describe('isHostBookingOwnListing', () => {
  it('is true only when the buyer is the listing host', () => {
    expect(isHostBookingOwnListing(sessionWith(), 'host-1')).toBe(true)
    expect(isHostBookingOwnListing(sessionWith(), 'guest-1')).toBe(false)
  })

  it('is false when either id is missing', () => {
    expect(isHostBookingOwnListing(sessionWith(), null)).toBe(false)
    expect(isHostBookingOwnListing(sessionWith(), undefined)).toBe(false)
    expect(isHostBookingOwnListing(sessionWith({ listings: { price_per_person: 2500 } }), 'host-1'))
      .toBe(false)
    expect(isHostBookingOwnListing(null, 'host-1')).toBe(false)
  })
})

describe('prepareBooking', () => {
  it('accepts a valid booking and returns the card amounts to charge', () => {
    expect(prepareBooking(sessionWith(), 2, 'card')).toEqual({
      ok: true,
      guestsCount: 2,
      paymentRail: 'card',
      ...calculateGuestCharge(discountedLessonCents(2500, 2), 'card'),
    })
  })

  it('applies no group discount when the host has turned it off', () => {
    expect(
      prepareBooking(
        sessionWith({ listings: { price_per_person: 2500, host_id: 'host-1', group_pricing: false } }),
        4,
        'card',
      ),
    ).toEqual({
      ok: true,
      guestsCount: 4,
      paymentRail: 'card',
      ...calculateGuestCharge(10000, 'card'),
    })
  })

  it('rejects more than ten guests on one booking', () => {
    expect(prepareBooking(sessionWith({ spots_remaining: 12 }), 11)).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid guest count',
    })
    expect(MAX_GUESTS_PER_BOOKING).toBe(10)
  })

  it('uses PayNow amounts when that rail is chosen', () => {
    expect(prepareBooking(sessionWith(), 1, 'paynow')).toEqual({
      ok: true,
      guestsCount: 1,
      paymentRail: 'paynow',
      ...calculateGuestCharge(2500, 'paynow'),
    })
  })

  it('defaults to card when the rail is omitted', () => {
    const result = prepareBooking(sessionWith(), 1)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.paymentRail).toBe('card')
  })

  it('403s when the host tries to book their own listing', () => {
    expect(prepareBooking(sessionWith(), 1, 'card', 'host-1')).toEqual({
      ok: false,
      status: 403,
      message: 'You cannot book your own listing.',
    })
  })

  it('still accepts a booking from anyone who is not the host', () => {
    expect(prepareBooking(sessionWith(), 1, 'card', 'guest-1').ok).toBe(true)
    expect(prepareBooking(sessionWith(), 1, 'card').ok).toBe(true)
  })

  it('404s when the session does not exist', () => {
    expect(prepareBooking(null, 1)).toEqual({
      ok: false,
      status: 404,
      message: 'Session not found',
    })
  })

  it('rejects a booking for more guests than there are spots', () => {
    expect(prepareBooking(sessionWith({ spots_remaining: 1 }), 2)).toEqual({
      ok: false,
      status: 400,
      message: 'Not enough spots',
    })
  })

  it('allows a booking that takes exactly the last spots', () => {
    const result = prepareBooking(sessionWith({ spots_remaining: 2 }), 2)
    expect(result.ok).toBe(true)
  })

  it('rejects a sold-out session', () => {
    expect(prepareBooking(sessionWith({ spots_remaining: 0 }), 1)).toMatchObject({
      ok: false,
      status: 400,
      message: 'Not enough spots',
    })
  })

  it('rejects a fractional guest count instead of charging a fraction of the price', () => {
    expect(prepareBooking(sessionWith(), 0.5)).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid guest count',
    })
  })

  it('rejects zero, negative and non-numeric guest counts', () => {
    for (const value of [0, -3, '2', null, undefined, NaN]) {
      expect(prepareBooking(sessionWith(), value)).toMatchObject({
        ok: false,
        status: 400,
        message: 'Invalid guest count',
      })
    }
  })

  it('rejects an unknown payment rail', () => {
    expect(prepareBooking(sessionWith(), 1, 'grabpay')).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid payment method',
    })
  })

  it('never returns an amount at or below zero for an accepted booking', () => {
    const result = prepareBooking(sessionWith(), 1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.totalAmount).toBeGreaterThan(0)
    }
  })

  it('rejects a listing with a missing or nonsensical price', () => {
    for (const price of [undefined, null, 0, -100, NaN]) {
      expect(prepareBooking(sessionWith({ listings: { price_per_person: price } }), 1)).toEqual({
        ok: false,
        status: 400,
        message: 'Listing price unavailable',
      })
    }
  })

  it('rejects when the listing relation is missing entirely', () => {
    expect(prepareBooking(sessionWith({ listings: null }), 1)).toMatchObject({
      ok: false,
      status: 400,
    })
  })

  it('checks the session before the guest count', () => {
    expect(prepareBooking(null, 0)).toMatchObject({ status: 404 })
  })
})

describe('group discounts', () => {
  it('caps at 20 percent from five guests up', () => {
    expect(groupDiscountRate(1)).toBe(0)
    expect(groupDiscountRate(2)).toBe(0.05)
    expect(groupDiscountRate(3)).toBe(0.1)
    expect(groupDiscountRate(4)).toBe(0.15)
    expect(groupDiscountRate(5)).toBe(0.2)
    expect(groupDiscountRate(6)).toBe(0.2)
    expect(groupDiscountRate(10)).toBe(0.2)
    expect(groupDiscountRate(5, false)).toBe(0)
  })

  it('rounds the per-person price first, then multiplies by guests', () => {
    expect(discountedPerPersonCents(2500, 4)).toBe(2125)
    expect(discountedLessonCents(2500, 4)).toBe(8500)
    expect(discountedLessonCents(2500, 4, false)).toBe(10000)
  })
})

describe('oversell of a group booking', () => {
  it('refunds the whole charge and restores every guest spot', () => {
    const charge = calculateGuestCharge(discountedLessonCents(2500, 3), 'card')
    expect(confirmRpcErrorKind('insufficient spots')).toBe('oversell')
    expect(
      refundAmountForCancel({
        status: 'confirmed',
        cancelledBy: 'host',
        totalAmount: charge.totalAmount,
        platformFee: charge.platformFee,
        sessionStartsAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
      }),
    ).toBe(charge.totalAmount)
    expect(spotsToRestore('confirmed', 3)).toBe(3)
  })
})

describe('unpaid checkout cancel', () => {
  it('refuses a guest cancel of a booking that was never paid', () => {
    expect(guestCancelDecision('pending')).toEqual({
      allow: false,
      status: 400,
      message: 'This checkout was never paid',
    })
    expect(guestCancelDecision('confirmed')).toEqual({ allow: true })
  })

  it('refuses a guest cancel of a row that is no longer cancellable', () => {
    expect(guestCancelDecision('cancelled')).toEqual({
      allow: false,
      status: 400,
      message: 'Booking cannot be cancelled',
    })
  })

  it('marks an unpaid checkout cancelled with a zero refund', () => {
    const guest = unpaidCheckoutCancelPatch()
    expect(guest).toMatchObject({
      status: 'cancelled',
      cancelled_by: 'guest',
      refund_amount: 0,
    })
    expect(Number.isNaN(Date.parse(guest.cancelled_at))).toBe(false)

    expect(unpaidCheckoutCancelPatch('host')).toMatchObject({
      status: 'cancelled',
      cancelled_by: 'host',
      refund_amount: 0,
    })
  })

  it('does not email a cancellation for a never-paid row', () => {
    expect(shouldEmailCancellation('pending')).toBe(false)
    expect(shouldEmailCancellation('confirmed')).toBe(true)
  })
})

describe('abandon-checkout', () => {
  it('is 403 unless the caller JWT is the booking guest', () => {
    expect(
      decideAbandonCheckout({
        callerId: null,
        guestId: 'guest-1',
        bookingStatus: 'pending',
      }),
    ).toEqual({ httpStatus: 403, error: 'Forbidden' })
    expect(
      decideAbandonCheckout({
        callerId: 'other-guest',
        guestId: 'guest-1',
        bookingStatus: 'pending',
      }),
    ).toEqual({ httpStatus: 403, error: 'Forbidden' })
    expect(
      decideAbandonCheckout({
        callerId: 'guest-1',
        guestId: null,
        bookingStatus: 'pending',
      }),
    ).toEqual({ httpStatus: 403, error: 'Forbidden' })
    expect(
      decideAbandonCheckout({
        callerId: 'guest-1',
        guestId: 'guest-1',
        bookingStatus: 'pending',
      }),
    ).toEqual({ abandon: true })
  })

  it('leaves the booking untouched when the PaymentIntent has already succeeded', () => {
    expect(
      decideAbandonCheckout({
        callerId: 'guest-1',
        guestId: 'guest-1',
        bookingStatus: 'pending',
        intentStatus: 'succeeded',
      }),
    ).toEqual({ abandon: false, reason: 'payment_succeeded' })
    expect(
      decideAbandonCheckout({
        callerId: 'guest-1',
        guestId: 'guest-1',
        bookingStatus: 'pending',
        intentStatus: 'processing',
      }),
    ).toEqual({ abandon: false, reason: 'payment_succeeded' })
    expect(
      decideAbandonCheckout({
        callerId: 'guest-1',
        guestId: 'guest-1',
        bookingStatus: 'confirmed',
      }),
    ).toEqual({ abandon: false, reason: 'not_pending' })
  })
})

describe('calculateGuestRefund', () => {
  const now = new Date('2026-06-15T10:00:00.000Z').getTime()
  const hoursFrom = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString()

  it('matches the published four-tier table on a stored platform fee', () => {
    expect(GUEST_REFUND_TIER_RULES.every((tier) => tier.refundsPlatformFee === false)).toBe(true)
    expect(calculateGuestRefund(4500, hoursFrom(72), 675, now)).toBe(3825)
    expect(calculateGuestRefund(4500, hoursFrom(30), 675, now)).toBe(1913)
    expect(calculateGuestRefund(4500, hoursFrom(12), 675, now)).toBe(956)
    expect(calculateGuestRefund(4500, hoursFrom(3), 675, now)).toBe(0)
  })

  it('keeps the booking fee on card and PayNow, with and without add-ons', () => {
    const card = calculateBookingCharge({ lessonCents: 2500, rail: 'card' })
    expect(calculateGuestRefund(card.totalAmount, hoursFrom(72), card.platformFee, now)).toBe(2500)
    expect(calculateGuestRefund(card.totalAmount, hoursFrom(30), card.platformFee, now)).toBe(1250)

    const paynow = calculateBookingCharge({ lessonCents: 2500, rail: 'paynow' })
    expect(calculateGuestRefund(paynow.totalAmount, hoursFrom(72), paynow.platformFee, now)).toBe(2500)

    const addons = [{ hostUnitCents: 1500, quantity: 1 }]
    const cardAddons = calculateBookingCharge({ lessonCents: 2500, addons, rail: 'card' })
    expect(calculateGuestRefund(cardAddons.totalAmount, hoursFrom(72), cardAddons.platformFee, now)).toBe(4000)
    expect(calculateGuestRefund(cardAddons.totalAmount, hoursFrom(30), cardAddons.platformFee, now)).toBe(2000)
    expect(calculateGuestRefund(cardAddons.totalAmount, hoursFrom(12), cardAddons.platformFee, now)).toBe(1000)

    const paynowAddons = calculateBookingCharge({ lessonCents: 2500, addons, rail: 'paynow' })
    expect(
      calculateGuestRefund(paynowAddons.totalAmount, hoursFrom(72), paynowAddons.platformFee, now),
    ).toBe(4000)
  })

  it('falls back to the legacy 15% rate when no fee was stored', () => {
    expect(LEGACY_PLATFORM_FEE_RATE).toBe(0.15)
    expect(calculateGuestRefund(4500, hoursFrom(72), undefined, now)).toBe(3825)
    expect(calculateGuestRefund(4500, hoursFrom(30), undefined, now)).toBe(1913)
  })
})

describe('rescheduleErrorMessage', () => {
  it('maps every RPC error to a guest-facing line', () => {
    expect(rescheduleErrorMessage('already rescheduled')).toBe("You've already moved this booking once.")
    expect(rescheduleErrorMessage('too late to reschedule')).toBe(
      'Moving closes 48 hours before the session.',
    )
    expect(rescheduleErrorMessage('insufficient add-ons')).toBe(
      "There aren't enough of your extras left on that date.",
    )
    expect(rescheduleErrorMessage('insufficient spots')).toBe('Not enough spots left on that date.')
    expect(rescheduleErrorMessage('paynow window')).toBe(
      'PayNow bookings can only move to a date within 80 days of when you paid.',
    )
    expect(rescheduleErrorMessage('not allowed')).toBe('Not allowed')
    expect(rescheduleErrorMessage('booking not found')).toBe('Booking not found')
    expect(rescheduleErrorMessage('session not available')).toBe("That date isn't available any more.")
    expect(rescheduleErrorMessage(undefined)).toBe("That date isn't available any more.")
  })
})

describe('confirmRpcErrorKind', () => {
  it('treats an oversell as a refund-and-cancel, not a confirm', () => {
    expect(confirmRpcErrorKind('insufficient spots')).toBe('oversell')
    expect(confirmRpcErrorKind('INSUFFICIENT SPOTS remaining')).toBe('oversell')
    expect(confirmRpcErrorKind('insufficient add-ons')).toBe('oversell')
    expect(confirmRpcErrorKind('session not open')).toBe('oversell')
    expect(confirmRpcErrorKind('SESSION NOT OPEN')).toBe('oversell')
    expect(confirmRpcErrorKind('booking not pending')).toBe('other')
    expect(confirmRpcErrorKind(undefined)).toBe('other')
  })
})

describe('refundAmountForCancel', () => {
  const now = new Date('2026-06-15T10:00:00.000Z').getTime()
  const starts = new Date(now + 72 * 60 * 60 * 1000).toISOString()

  it('refunds nothing for a pending unpaid booking', () => {
    expect(
      refundAmountForCancel({
        status: 'pending',
        cancelledBy: 'guest',
        totalAmount: 2800,
        platformFee: 300,
        sessionStartsAt: starts,
        now,
      }),
    ).toBe(0)
  })

  it('uses the guest four-tier table on a confirmed booking', () => {
    expect(
      refundAmountForCancel({
        status: 'confirmed',
        cancelledBy: 'guest',
        totalAmount: 2800,
        platformFee: 300,
        sessionStartsAt: starts,
        now,
      }),
    ).toBe(2500)
  })

  it('repays the whole charge when the host or admin cancels', () => {
    expect(
      refundAmountForCancel({
        status: 'confirmed',
        cancelledBy: 'host',
        totalAmount: 2800,
        platformFee: 300,
        sessionStartsAt: starts,
        now,
      }),
    ).toBe(2800)
    expect(
      refundAmountForCancel({
        status: 'confirmed',
        cancelledBy: 'admin',
        totalAmount: 2800,
        platformFee: 300,
        sessionStartsAt: starts,
        now,
      }),
    ).toBe(2800)
  })
})

describe('paymentIntentCreateParams', () => {
  it('locks the Stripe amount and method to the chosen rail', () => {
    const params = paymentIntentCreateParams({
      amount: 2660,
      bookingId: 'booking-1',
      sessionId: 'session-1',
      guestId: 'guest-1',
      guestsCount: 1,
      paymentRail: 'paynow',
      platformFee: 160,
    })

    expect(params).toEqual({
      amount: 2660,
      currency: 'sgd',
      payment_method_types: ['paynow'],
      transfer_group: 'booking-1',
      metadata: {
        booking_id: 'booking-1',
        session_id: 'session-1',
        guest_id: 'guest-1',
        guests_count: '1',
        payment_rail: 'paynow',
        platform_fee: '160',
        addons_amount: '0',
      },
    })
  })
})

describe('calculateBookingCharge', () => {
  const now = new Date('2026-06-15T10:00:00.000Z').getTime()
  const hoursFrom = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString()
  const canvasAddons = [
    { hostUnitCents: 1500, quantity: 1 },
    { hostUnitCents: 800, quantity: 2 },
  ]

  it('matches calculateGuestCharge when there are no add-ons', () => {
    for (const lesson of [1000, 2500, 5700, 10000]) {
      for (const rail of ['card', 'paynow'] as const) {
        expect(calculateBookingCharge({ lessonCents: lesson, addons: [], rail })).toMatchObject(
          calculateGuestCharge(lesson, rail),
        )
      }
    }
  })

  it('prices the canvas worked example', () => {
    const lessonCents = discountedLessonCents(3000, 2, true)
    expect(lessonCents).toBe(5700)
    const card = calculateBookingCharge({ lessonCents, addons: canvasAddons, rail: 'card' })
    expect(card).toMatchObject({
      totalAmount: 9900,
      addonsAmount: 3100,
      platformFee: 1100,
    })
    const paynow = calculateBookingCharge({ lessonCents, addons: canvasAddons, rail: 'paynow' })
    expect(paynowDiscountRate(card.totalAmount)).toBe(0.02)
    expect(paynow).toMatchObject({
      totalAmount: 9702,
      addonsAmount: 3100,
      platformFee: 902,
    })
    expect(
      hostPayoutBreakdown({
        totalAmount: 9900,
        platformFee: 1100,
        addonsAmount: 3100,
        isFoundingHost: true,
        priorConfirmedCount: 99,
      }),
    ).toMatchObject({ hostFee: 0, hostPayoutAmount: 8800 })
    expect(
      hostPayoutBreakdown({
        totalAmount: 9900,
        platformFee: 1100,
        addonsAmount: 3100,
        isFoundingHost: false,
        priorConfirmedCount: 3,
      }),
    ).toMatchObject({ hostFee: 570, hostPayoutAmount: 8230 })
    expect(calculateGuestRefund(9900, hoursFrom(30), 1100, now)).toBe(4400)
  })

  it('applies PayNow tiers to the combined card total', () => {
    const cheap = calculateBookingCharge({
      lessonCents: 1000,
      addons: [{ hostUnitCents: 100, quantity: 1 }],
      rail: 'paynow',
    })
    const cardCheap = calculateBookingCharge({
      lessonCents: 1000,
      addons: [{ hostUnitCents: 100, quantity: 1 }],
      rail: 'card',
    })
    expect(paynowDiscountRate(cardCheap.totalAmount)).toBe(0.05)
    expect(cheap.totalAmount).toBe(Math.round(cardCheap.totalAmount * 0.95))
  })
})

describe('prepareCheckoutAddons', () => {
  const catalog = [
    {
      id: 'blooms',
      name: 'Premium blooms',
      unit: 'person' as const,
      price_cents: 1500,
      session_limit: 2,
      is_active: true,
    },
    {
      id: 'wrap',
      name: 'Gift wrap',
      unit: 'booking' as const,
      price_cents: 800,
      is_active: true,
    },
  ]

  it('rejects unknown ids and over-limit quantities', () => {
    expect(
      prepareCheckoutAddons({
        requested: [{ id: 'gone', quantity: 1 }],
        catalog,
        guestsCount: 2,
      }),
    ).toEqual({
      ok: false,
      status: 400,
      message: 'That add-on is no longer available. Refresh and try again.',
    })
    expect(
      prepareCheckoutAddons({
        requested: [{ id: 'blooms', quantity: 2 }],
        catalog,
        guestsCount: 2,
        remainingByAddon: { blooms: 1 },
      }),
    ).toEqual({
      ok: false,
      status: 400,
      message: 'Only 1 Premium blooms left for this session.',
    })
  })

  it('ignores zeros and snapshots host and guest unit prices', () => {
    expect(calculateBookingCharge({ lessonCents: 2500, rail: 'card' }).addonsAmount).toBe(0)
    expect(parseAddonNote(null)).toBeNull()
    expect(parseAddonNote('   ')).toBeNull()
    expect(parseAddonNote(`  ${'x'.repeat(130)}  `)).toHaveLength(120)
    expect(
      prepareCheckoutAddons({ requested: { id: 'wrap', quantity: 1 }, catalog, guestsCount: 2 }),
    ).toEqual({ ok: true, lines: [] })
    expect(
      prepareCheckoutAddons({
        requested: [{ quantity: 1 }],
        catalog,
        guestsCount: 2,
      }).ok,
    ).toBe(false)
    expect(
      prepareCheckoutAddons({
        requested: [{ id: 'wrap', quantity: '0' }, { id: 'wrap', quantity: 1 }],
        catalog,
        guestsCount: 2,
      }).ok,
    ).toBe(true)
    expect(
      prepareCheckoutAddons({
        requested: [{ id: 'blooms', quantity: 1.5 }],
        catalog,
        guestsCount: 2,
      }),
    ).toMatchObject({ ok: false, message: 'Choose a whole number of each add-on.' })
    expect(
      prepareCheckoutAddons({
        requested: [{ id: 'wrap', quantity: 2 }],
        catalog,
        guestsCount: 2,
      }),
    ).toMatchObject({ ok: false, message: 'That add-on is once per booking.' })
    expect(
      prepareCheckoutAddons({
        requested: [{ id: 'blooms', quantity: 3 }],
        catalog,
        guestsCount: 2,
      }).message,
    ).toMatch(/at most 2/)
    expect(
      prepareCheckoutAddons({
        requested: [
          { id: 'blooms', quantity: 1 },
          { id: 'wrap', quantity: 1 },
          { id: 'blooms', quantity: 1 },
          { id: 'wrap', quantity: 1 },
        ],
        catalog,
        guestsCount: 2,
      }),
    ).toMatchObject({ ok: false, message: 'You can pick up to 3 add-ons.' })
    const prepared = prepareCheckoutAddons({
      requested: [
        { id: 'blooms', quantity: 0 },
        { id: 'wrap', quantity: 1 },
      ],
      catalog,
      guestsCount: 2,
    })
    expect(prepared).toEqual({
      ok: true,
      lines: [
        {
          id: 'wrap',
          name: 'Gift wrap',
          unit: 'booking',
          quantity: 1,
          hostUnitCents: 800,
          guestUnitCents: 900,
        },
      ],
    })
    expect(
      hostPayoutBreakdown({
        totalAmount: 5100,
        platformFee: 600,
        isFoundingHost: true,
        priorConfirmedCount: 0,
      }).hostPayoutAmount,
    ).toBe(4500)
  })
})
