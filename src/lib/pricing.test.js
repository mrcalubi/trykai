import { describe, expect, it } from 'vitest'
import {
  checkoutPriceCents,
  discountedLessonCents,
  formatCheckoutPrice,
  formatGuestFacingPrice,
  groupPriceLabel,
  guestFacingPriceCents,
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

  it('labels the live per-person group price', () => {
    expect(groupPriceLabel(2500, 1)).toBe('$25 each')
    expect(groupPriceLabel(2500, 4)).toBe('$21.25 each, 15% group price')
    expect(discountedPerPersonCents(2500, 4)).toBe(2125)
  })
})
