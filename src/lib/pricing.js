/**
 * Guest-facing price helpers. Browse and listing pages show the card all-in
 * total so the number never rises between viewing and paying.
 */

import { calculateGuestCharge } from '../../supabase/functions/_shared/booking.ts'
import { formatCents } from './cancellationPolicy'

export function guestFacingPriceCents(pricePerPersonCents) {
  return calculateGuestCharge(pricePerPersonCents, 'card').totalAmount
}

export function formatGuestFacingPrice(pricePerPersonCents) {
  return formatCents(guestFacingPriceCents(pricePerPersonCents))
}

export function paynowPriceCents(pricePerPersonCents) {
  return calculateGuestCharge(pricePerPersonCents, 'paynow').totalAmount
}

export function checkoutPriceCents(pricePerPersonCents, rail = 'card') {
  return rail === 'paynow'
    ? paynowPriceCents(pricePerPersonCents)
    : guestFacingPriceCents(pricePerPersonCents)
}

export function formatCheckoutPrice(pricePerPersonCents, rail = 'card') {
  return formatCents(checkoutPriceCents(pricePerPersonCents, rail))
}
