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

export function groupPriceLabel(pricePerPersonCents, guestsCount, groupPricing = true) {
  const each = formatCents(
    discountedPerPersonCents(pricePerPersonCents, guestsCount, groupPricing),
  )
  const rate = groupDiscountRate(guestsCount, groupPricing)
  if (rate === 0) return `${each} each`
  return `${each} each, ${Math.round(rate * 100)}% group price`
}
