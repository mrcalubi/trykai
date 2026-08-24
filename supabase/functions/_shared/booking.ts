/**
 * Booking money rules, kept free of Deno, Stripe and Supabase imports so they
 * can be exercised directly by the test suite. Anything that decides how much a
 * guest is charged belongs here rather than inline in a request handler.
 */

export const PLATFORM_FEE_RATE = 0.15

export interface BookingSession {
  spots_remaining: number
  listings?: { price_per_person?: number | null } | null
}

export interface BookingAmounts {
  totalAmount: number
  platformFee: number
  hostPayout: number
}

export type BookingRejection = {
  ok: false
  status: number
  message: string
}

export type BookingAcceptance = BookingAmounts & {
  ok: true
  guestsCount: number
}

export function calculateBookingAmounts(
  pricePerPersonCents: number,
  guestsCount: number,
): BookingAmounts {
  const totalAmount = pricePerPersonCents * guestsCount
  const platformFee = Math.round(totalAmount * PLATFORM_FEE_RATE)
  return { totalAmount, platformFee, hostPayout: totalAmount - platformFee }
}

/**
 * A guest count arrives from the request body, so it has to be treated as
 * untrusted. A fractional value would otherwise pass the spots check and buy a
 * session at a fraction of its price.
 */
export function isValidGuestsCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function prepareBooking(
  session: BookingSession | null | undefined,
  guestsCount: unknown,
): BookingAcceptance | BookingRejection {
  if (!session) {
    return { ok: false, status: 404, message: 'Session not found' }
  }

  if (!isValidGuestsCount(guestsCount)) {
    return { ok: false, status: 400, message: 'Invalid guest count' }
  }

  if (session.spots_remaining < guestsCount) {
    return { ok: false, status: 400, message: 'Not enough spots' }
  }

  const pricePerPerson = session.listings?.price_per_person
  if (
    typeof pricePerPerson !== 'number' ||
    !Number.isFinite(pricePerPerson) ||
    pricePerPerson <= 0
  ) {
    return { ok: false, status: 400, message: 'Listing price unavailable' }
  }

  return {
    ok: true,
    guestsCount,
    ...calculateBookingAmounts(pricePerPerson, guestsCount),
  }
}
