import { describe, expect, it } from 'vitest'
import {
  PLATFORM_FEE_RATE,
  calculateBookingAmounts,
  isValidGuestsCount,
  prepareBooking,
} from './booking.ts'

function sessionWith(overrides = {}) {
  return {
    spots_remaining: 4,
    listings: { price_per_person: 4500 },
    ...overrides,
  }
}

describe('calculateBookingAmounts', () => {
  it('charges the per-person price for every guest', () => {
    expect(calculateBookingAmounts(4500, 3).totalAmount).toBe(13500)
  })

  it('takes a 15% platform fee', () => {
    expect(PLATFORM_FEE_RATE).toBe(0.15)
    expect(calculateBookingAmounts(4500, 1).platformFee).toBe(675)
    expect(calculateBookingAmounts(10000, 2).platformFee).toBe(3000)
  })

  it('rounds the fee to whole cents', () => {
    // 3333 * 0.15 = 499.95
    expect(calculateBookingAmounts(3333, 1).platformFee).toBe(500)
    // 1010 * 0.15 = 151.5
    expect(calculateBookingAmounts(1010, 1).platformFee).toBe(152)
  })

  it('splits the total between the platform and the host with nothing lost', () => {
    for (const price of [999, 1000, 3333, 4500, 12345]) {
      for (const guests of [1, 2, 5]) {
        const { totalAmount, platformFee, hostPayout } = calculateBookingAmounts(price, guests)
        expect(platformFee + hostPayout).toBe(totalAmount)
        expect(Number.isInteger(platformFee)).toBe(true)
        expect(Number.isInteger(hostPayout)).toBe(true)
      }
    }
  })

  it('always produces an integer amount Stripe will accept', () => {
    const { totalAmount, platformFee } = calculateBookingAmounts(2999, 3)
    expect(Number.isInteger(totalAmount)).toBe(true)
    expect(Number.isInteger(platformFee)).toBe(true)
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
  it('accepts a valid booking and returns the amounts to charge', () => {
    expect(prepareBooking(sessionWith(), 2)).toEqual({
      ok: true,
      guestsCount: 2,
      totalAmount: 9000,
      platformFee: 1350,
      hostPayout: 7650,
    })
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

  // A fractional guest count clears the spots check but scales the price down,
  // so it would let a guest buy a session at a discount.
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
