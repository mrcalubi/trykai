import { describe, expect, it } from 'vitest'
import {
  CARD_FEE_FLOOR_CENTS,
  CARD_FEE_RATE,
  HOST_FEE_FREE_BOOKINGS,
  HOST_FEE_RATE,
  LEGACY_PLATFORM_FEE_RATE,
  PAYNOW_DISCOUNT_RATE,
  calculateGuestCharge,
  calculateGuestRefund,
  calculateHostFee,
  calculateHostPayout,
  confirmRpcErrorKind,
  isPaymentRail,
  isValidGuestsCount,
  nextHostStrikeState,
  paymentIntentCreateParams,
  prepareBooking,
  refundAmountForCancel,
  roundUpToDollar,
  spotsToRestore,
} from './booking.ts'

function sessionWith(overrides: Record<string, unknown> = {}) {
  return {
    spots_remaining: 4,
    listings: { price_per_person: 2500 },
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
  it('takes 5% off the card all-in total', () => {
    expect(PAYNOW_DISCOUNT_RATE).toBe(0.05)
    const card = calculateGuestCharge(2500, 'card')
    const paynow = calculateGuestCharge(2500, 'paynow')
    expect(paynow.totalAmount).toBe(Math.round(card.totalAmount * 0.95))
    expect(paynow.totalAmount).toBe(2660)
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

describe('prepareBooking', () => {
  it('accepts a valid booking and returns the card amounts to charge', () => {
    expect(prepareBooking(sessionWith(), 2, 'card')).toEqual({
      ok: true,
      guestsCount: 2,
      paymentRail: 'card',
      ...calculateGuestCharge(5000, 'card'),
    })
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

describe('calculateGuestRefund', () => {
  const now = new Date('2026-06-15T10:00:00.000Z').getTime()
  const hoursFrom = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString()

  it('matches the published four-tier table on a stored platform fee', () => {
    expect(calculateGuestRefund(4500, hoursFrom(72), 675, now)).toBe(4500)
    expect(calculateGuestRefund(4500, hoursFrom(30), 675, now)).toBe(1913)
    expect(calculateGuestRefund(4500, hoursFrom(12), 675, now)).toBe(956)
    expect(calculateGuestRefund(4500, hoursFrom(3), 675, now)).toBe(0)
  })

  it('falls back to the legacy 15% rate when no fee was stored', () => {
    expect(LEGACY_PLATFORM_FEE_RATE).toBe(0.15)
    expect(calculateGuestRefund(4500, hoursFrom(30), undefined, now)).toBe(1913)
  })
})

describe('confirmRpcErrorKind', () => {
  it('treats an oversell as a refund-and-cancel, not a confirm', () => {
    expect(confirmRpcErrorKind('insufficient spots')).toBe('oversell')
    expect(confirmRpcErrorKind('INSUFFICIENT SPOTS remaining')).toBe('oversell')
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
    ).toBe(2800)
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
      },
    })
  })
})
