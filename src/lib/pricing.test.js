import { describe, expect, it } from 'vitest'
import {
  checkoutPriceCents,
  discountedLessonCents,
  formatCheckoutPrice,
  formatGuestFacingPrice,
  groupPriceLabel,
  guestFacingPriceCents,
  groupDiscountExampleLine,
  hostPriceBreakdown,
  nextGroupTierHint,
  parsePriceInputCents,
  paynowPriceCents,
} from './pricing'
import {
  calculateGuestCharge,
  discountedLessonCents as bookingLessonCents,
  discountedPerPersonCents,
} from '../../supabase/functions/_shared/booking.ts'

describe('guestFacingPriceCents', () => {
  it('is the card all-in total, not the raw lesson price', () => {
    expect(guestFacingPriceCents(2500)).toBe(2800)
    expect(guestFacingPriceCents(2500)).toBe(calculateGuestCharge(2500, 'card').totalAmount)
  })

  it('formats the published band as whole dollars', () => {
    expect(formatGuestFacingPrice(1000)).toBe('$13')
    expect(formatGuestFacingPrice(2000)).toBe('$23')
    expect(formatGuestFacingPrice(2500)).toBe('$28')
    expect(formatGuestFacingPrice(3000)).toBe('$34')
    expect(formatGuestFacingPrice(4000)).toBe('$45')
  })
})

describe('paynowPriceCents', () => {
  it('is 5% off the card all-in total', () => {
    expect(paynowPriceCents(2500)).toBe(2660)
    expect(paynowPriceCents(2500)).toBeLessThan(guestFacingPriceCents(2500))
  })
})

describe('checkoutPriceCents', () => {
  it('uses the advertised card total unless PayNow is chosen', () => {
    expect(checkoutPriceCents(2500, 'card')).toBe(2800)
    expect(checkoutPriceCents(2500, 'paynow')).toBe(2660)
    expect(checkoutPriceCents(2500)).toBe(2800)
    expect(formatCheckoutPrice(2500, 'paynow')).toBe('$26.60')
  })
})

describe('pricing.js matches booking.ts', () => {
  const prices = [1000, 2500, 4000]
  const guests = [1, 2, 3, 4, 5, 6]

  it('agrees on lesson and all-in totals for 1–6 guests at S$10, S$25 and S$40', () => {
    for (const price of prices) {
      for (const count of guests) {
        const lesson = discountedLessonCents(price, count)
        expect(lesson).toBe(bookingLessonCents(price, count))
        expect(guestFacingPriceCents(price, count)).toBe(
          calculateGuestCharge(lesson, 'card').totalAmount,
        )
        expect(paynowPriceCents(price, count)).toBe(
          calculateGuestCharge(lesson, 'paynow').totalAmount,
        )
      }
    }
  })

  it('agrees when group pricing is off', () => {
    expect(discountedLessonCents(2500, 4, false)).toBe(10000)
    expect(guestFacingPriceCents(2500, 4, false)).toBe(
      calculateGuestCharge(10000, 'card').totalAmount,
    )
    expect(paynowPriceCents(2500, 4, false)).toBe(
      calculateGuestCharge(10000, 'paynow').totalAmount,
    )
  })

  it('labels the live all-in price per person', () => {
    expect(groupPriceLabel(2500, 1)).toBe('$28 per person')
    expect(groupPriceLabel(2500, 2)).toBe('$27 each · 5% group discount')
    expect(groupPriceLabel(2500, 4, false)).toBe('$28 each')
    expect(groupPriceLabel(135800, 1)).toBe('$1,521 per person')
    expect(discountedPerPersonCents(2500, 4)).toBe(2125)
  })

  it('parses a dollar price into cents and rejects empty or invalid values', () => {
    expect(parsePriceInputCents('25')).toBe(2500)
    expect(parsePriceInputCents('')).toBeNull()
    expect(parsePriceInputCents(null)).toBeNull()
    expect(parsePriceInputCents('   ')).toBeNull()
    expect(parsePriceInputCents('0')).toBeNull()
    expect(parsePriceInputCents('abc')).toBeNull()
  })

  it('shows a full session as N times the lesson, never a range', () => {
    const founding = hostPriceBreakdown(2500, true, 4, true)
    expect(founding.afterFeeCents).toBeNull()
    expect(founding.youReceiveCents).toBe(2500)
    expect(founding.isFoundingHost).toBe(true)
    expect(founding.togetherCents).toBe(8500)
    expect(founding.fullSessionCents).toBe(10000)
    expect(founding.fullSessionLowCents).toBeNull()
    expect(founding.fullSessionHighCents).toBe(10000)

    const feePaying = hostPriceBreakdown(2500, false, 4, true)
    expect(feePaying.afterFeeCents).toBe(2250)
    expect(feePaying.togetherCents).toBe(8500)
    expect(feePaying.fullSessionCents).toBe(10000)
    expect(feePaying.fullSessionLowCents).toBeNull()

    const off = hostPriceBreakdown(2500, false, 4, false)
    expect(off.togetherCents).toBe(10000)
    expect(off.fullSessionCents).toBe(10000)
    expect(off.fullSessionLowCents).toBeNull()

    const unknown = hostPriceBreakdown(2500, null, 4, true)
    expect(unknown.youReceiveCents).toBeNull()
    expect(unknown.afterFeeCents).toBeNull()
    expect(unknown.isFoundingHost).toBeNull()
    expect(unknown.fullSessionCents).toBe(10000)
    expect(unknown.togetherCents).toBe(8500)
  })

  it('explains the group discount off the host lesson price', () => {
    expect(groupDiscountExampleLine(2500, 4)).toBe(
      'Group discounts come off your price, e.g. a group of 4 together pays you $85 instead of $100.',
    )
    expect(groupDiscountExampleLine(null, 4)).toBe('')
  })

  it('hints the next group tier when one is still available', () => {
    expect(nextGroupTierHint(1, true, 4)).toBe('Add 1 more for 5% off')
    expect(nextGroupTierHint(2, true, 4)).toBe('Add 1 more for 10% off')
    expect(nextGroupTierHint(4, true, 4)).toBe('')
    expect(nextGroupTierHint(5, true, 10)).toBe('')
    expect(nextGroupTierHint(2, false, 4)).toBe('')
  })
})
