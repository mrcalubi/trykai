/**
 * Guest-facing price helpers. Browse and listing pages show the card all-in
 * total for one person so the number never rises between viewing and paying.
 * Checkout uses the same functions with guestsCount and the listing's
 * group_pricing flag. Amounts come from booking.ts so the browser and
 * create-payment-intent cannot drift.
 */

import {
  calculateGuestCharge,
  discountedLessonCents,
  discountedPerPersonCents,
  groupDiscountRate,
  HOST_FEE_RATE,
  MAX_GUESTS_PER_BOOKING,
} from '../../supabase/functions/_shared/booking.ts'
import { formatCents } from './cancellationPolicy'

export {
  discountedLessonCents,
  discountedPerPersonCents,
  groupDiscountRate,
  MAX_GUESTS_PER_BOOKING,
}

export function guestFacingPriceCents(
  pricePerPersonCents,
  guestsCount = 1,
  groupPricing = true,
) {
  return calculateGuestCharge(
    discountedLessonCents(pricePerPersonCents, guestsCount, groupPricing),
    'card',
  ).totalAmount
}

export function formatGuestFacingPrice(
  pricePerPersonCents,
  guestsCount = 1,
  groupPricing = true,
) {
  return formatCents(guestFacingPriceCents(pricePerPersonCents, guestsCount, groupPricing))
}

export function paynowPriceCents(
  pricePerPersonCents,
  guestsCount = 1,
  groupPricing = true,
) {
  return calculateGuestCharge(
    discountedLessonCents(pricePerPersonCents, guestsCount, groupPricing),
    'paynow',
  ).totalAmount
}

export function checkoutPriceCents(
  pricePerPersonCents,
  rail = 'card',
  guestsCount = 1,
  groupPricing = true,
) {
  return rail === 'paynow'
    ? paynowPriceCents(pricePerPersonCents, guestsCount, groupPricing)
    : guestFacingPriceCents(pricePerPersonCents, guestsCount, groupPricing)
}

export function formatCheckoutPrice(
  pricePerPersonCents,
  rail = 'card',
  guestsCount = 1,
  groupPricing = true,
) {
  return formatCents(
    checkoutPriceCents(pricePerPersonCents, rail, guestsCount, groupPricing),
  )
}

export function allInEachCents(
  pricePerPersonCents,
  guestsCount = 1,
  groupPricing = true,
  rail = 'card',
) {
  const total = checkoutPriceCents(pricePerPersonCents, rail, guestsCount, groupPricing)
  return Math.round(total / Math.max(guestsCount, 1))
}

export function groupPriceLabel(
  pricePerPersonCents,
  guestsCount,
  groupPricing = true,
  rail = 'card',
) {
  const each = formatCents(
    allInEachCents(pricePerPersonCents, guestsCount, groupPricing, rail),
  )
  const rate = groupDiscountRate(guestsCount, groupPricing)
  if (guestsCount <= 1) return `${each} per person`
  if (rate === 0) return `${each} each`
  return `${each} each · ${Math.round(rate * 100)}% group discount`
}

export function parsePriceInputCents(value) {
  if (value == null || String(value).trim() === '') return null
  const cents = Math.round(Number.parseFloat(String(value)) * 100)
  if (!Number.isFinite(cents) || cents < 1) return null
  return cents
}

/**
 * Hosts may see the public all-in listing price next to what they receive.
 * They never see an individual guest's payment. Non-founding hosts also see
 * the 10% fee that starts on the fourth confirmed booking.
 */
export function hostListingPriceHint(pricePerPersonCents, isFoundingHost = false) {
  if (!Number.isFinite(pricePerPersonCents) || pricePerPersonCents < 1) return ''
  const guestsSee = formatGuestFacingPrice(pricePerPersonCents)
  const youReceive = formatCents(pricePerPersonCents)
  const line = `Guests see ${guestsSee} · You receive ${youReceive}`
  if (isFoundingHost) return line
  const afterFee = formatCents(Math.round(pricePerPersonCents * (1 - HOST_FEE_RATE)))
  return `${line} · ${afterFee} after your first 3 bookings`
}

export function nextGroupTierHint(guestsCount, groupPricing, maxGuests) {
  if (!groupPricing) return ''
  if (guestsCount >= maxGuests) return ''
  const nextRate = groupDiscountRate(guestsCount + 1, true)
  const current = groupDiscountRate(guestsCount, true)
  if (nextRate <= current) return ''
  return `Add 1 more for ${Math.round(nextRate * 100)}% off`
}
