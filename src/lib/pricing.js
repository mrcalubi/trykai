/**
 * Guest-facing price helpers. Browse and listing pages show the card all-in
 * total for one person so the number never rises between viewing and paying.
 * Checkout uses the same functions with guestsCount and the listing's
 * group_pricing flag. Amounts come from booking.ts so the browser and
 * create-payment-intent cannot drift.
 */

import {
  addonGuestUnitCents,
  calculateGuestCharge,
  discountedLessonCents,
  discountedPerPersonCents,
  groupDiscountRate,
  HOST_FEE_FREE_BOOKINGS,
  HOST_FEE_RATE,
  MAX_GUESTS_PER_BOOKING,
  PAYNOW_DISCOUNT_TIERS,
  PAYNOW_MAX_DAYS_AHEAD,
  PAYNOW_TOO_FAR_AHEAD,
  PAYNOW_TOO_FAR_AHEAD_MESSAGE,
  isPayNowTooFarAhead,
  paynowDiscountRate,
} from '../../supabase/functions/_shared/booking.ts'
import { formatCents } from './cancellationPolicy'

export {
  addonGuestUnitCents,
  discountedLessonCents,
  discountedPerPersonCents,
  groupDiscountRate,
  PAYNOW_DISCOUNT_TIERS,
  paynowDiscountRate,
  MAX_GUESTS_PER_BOOKING,
  PAYNOW_MAX_DAYS_AHEAD,
  PAYNOW_TOO_FAR_AHEAD,
  PAYNOW_TOO_FAR_AHEAD_MESSAGE,
  isPayNowTooFarAhead,
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

/**
 * Typo guard, not the S$10 to S$40 guidance band. Matches the
 * listings_price_ceiling CHECK in migration 00028.
 */
export const MAX_PRICE_PER_PERSON_CENTS = 50000

export function parsePriceInputCents(value) {
  if (value == null || String(value).trim() === '') return null
  const cents = Math.round(Number.parseFloat(String(value)) * 100)
  if (!Number.isFinite(cents) || cents < 1 || cents > MAX_PRICE_PER_PERSON_CENTS) return null
  return cents
}

export const GROUP_DISCOUNT_TIERS = [
  { guests: 2, percent: 5 },
  { guests: 3, percent: 10 },
  { guests: 4, percent: 15 },
  { guests: '5+', percent: 20 },
]

/**
 * The numbers the create-listing price step shows a host. Founding-host status
 * decides whether the host fee applies, so `null` (unknown) leaves out "you get"
 * and the fee footnote rather than promise a cut the host may not get.
 */
export function hostPriceBreakdown(
  pricePerPersonCents,
  isFoundingHost,
  groupSize,
  groupPricing = true,
) {
  if (!Number.isFinite(pricePerPersonCents) || pricePerPersonCents < 1) return null
  const size = Number.isFinite(groupSize) && groupSize > 0 ? groupSize : 1
  const high = pricePerPersonCents * size
  const togetherCents = discountedLessonCents(pricePerPersonCents, size, groupPricing)
  const guestsPayCents = guestFacingPriceCents(pricePerPersonCents)
  const knownHost = isFoundingHost === true || isFoundingHost === false
  return {
    guestsPayCents,
    youReceiveCents: knownHost ? pricePerPersonCents : null,
    afterFeeCents:
      isFoundingHost === false ? Math.round(pricePerPersonCents * (1 - HOST_FEE_RATE)) : null,
    feeFreeBookings: HOST_FEE_FREE_BOOKINGS,
    feePercent: Math.round(HOST_FEE_RATE * 100),
    isFoundingHost: knownHost ? isFoundingHost : null,
    groupPricing: Boolean(groupPricing),
    groupSize: size,
    togetherCents,
    fullSessionCents: high,
    fullSessionHighCents: high,
    fullSessionLowCents: null,
  }
}

/** One muted line under “Offer group discounts”. Empty when there is no price. */
export function groupDiscountExampleLine(pricePerPersonCents, groupSize) {
  if (!Number.isFinite(pricePerPersonCents) || pricePerPersonCents < 1) return ''
  const size = Number.isFinite(groupSize) && groupSize > 0 ? groupSize : 1
  const full = pricePerPersonCents * size
  const together = discountedLessonCents(pricePerPersonCents, size, true)
  return `Group discounts come off your price, e.g. a group of ${size} together pays you ${formatCents(together)} instead of ${formatCents(full)}.`
}

export function nextGroupTierHint(guestsCount, groupPricing, maxGuests) {
  if (!groupPricing) return ''
  if (guestsCount >= maxGuests) return ''
  const nextRate = groupDiscountRate(guestsCount + 1, true)
  const current = groupDiscountRate(guestsCount, true)
  if (nextRate <= current) return ''
  return `Add 1 more for ${Math.round(nextRate * 100)}% off`
}
