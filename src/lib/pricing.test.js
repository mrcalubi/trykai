import { describe, expect, it } from 'vitest'
import {
  checkoutPriceCents,
  formatCheckoutPrice,
  formatGuestFacingPrice,
  guestFacingPriceCents,
  paynowPriceCents,
} from './pricing'
import { calculateGuestCharge } from '../../supabase/functions/_shared/booking.ts'

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
