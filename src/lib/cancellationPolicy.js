// The tiers below are the published Cancellation Policy, in code. Anything that
// changes what a guest is refunded should change this table and the wording on
// src/pages/CancellationPolicy.jsx together.
//
// Partial refunds are a share of `total_amount` (what the guest paid), not of
// the host's lesson. A full refund is also `total_amount`.

// Legacy fallback only: bookings taken before `platform_fee` was stored used a
// 15% carve-out. Live charges use calculateGuestCharge in booking.ts.
export const PLATFORM_FEE_RATE = 0.15

export const CANCELLATION_POLICY_ITEMS = [
  {
    scenario: 'Guest cancels 48+ hours before session',
    resolution: 'Full refund of the amount paid',
  },
  {
    scenario: 'Guest cancels 24–48 hours before session',
    resolution: '50% of the amount paid',
  },
  {
    scenario: 'Guest cancels 6–24 hours before session',
    resolution: '25% of the amount paid',
  },
  {
    scenario: 'Guest cancels under 6 hours before session, or does not show up',
    resolution: 'No refund',
  },
  {
    scenario: 'Host cancels anytime',
    resolution: 'Full refund to guest + host receives a strike',
  },
  { scenario: '3 host strikes', resolution: 'Listing is automatically deactivated' },
]

export function formatCents(cents) {
  const dollars = cents / 100
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

/**
 * Ordered widest-window-first: the first tier whose threshold the cancellation
 * clears is the one that applies. The final tier catches everything else,
 * including sessions that have already started.
 */
export const GUEST_REFUND_TIERS = [
  {
    id: 'full',
    minHoursBefore: 48,
    totalShare: 1,
    describe: (refund) =>
      `Full refund of ${formatCents(refund)} ` +
      `(cancelled 48 or more hours before the session).`,
  },
  {
    id: 'half',
    minHoursBefore: 24,
    totalShare: 0.5,
    describe: (refund) =>
      `Partial refund of ${formatCents(refund)} — 50% of what you paid ` +
      `(cancelled 24 to 48 hours before the session).`,
  },
  {
    id: 'quarter',
    minHoursBefore: 6,
    totalShare: 0.25,
    describe: (refund) =>
      `Partial refund of ${formatCents(refund)} — 25% of what you paid ` +
      `(cancelled 6 to 24 hours before the session).`,
  },
  {
    id: 'none',
    minHoursBefore: Number.NEGATIVE_INFINITY,
    totalShare: 0,
    describe: () => 'No refund (cancelled less than 6 hours before the session).',
  },
]

export function hoursUntilSession(sessionStartsAt) {
  return (new Date(sessionStartsAt).getTime() - Date.now()) / (1000 * 60 * 60)
}

export function guestRefundTier(sessionStartsAt) {
  const hoursUntil = hoursUntilSession(sessionStartsAt)
  return GUEST_REFUND_TIERS.find((tier) => hoursUntil >= tier.minHoursBefore)
}

export function calculateGuestRefund(totalAmountCents, sessionStartsAt, platformFeeCents) {
  void platformFeeCents
  const tier = guestRefundTier(sessionStartsAt)
  return Math.round(totalAmountCents * tier.totalShare)
}

export function guestRefundDescription(totalAmountCents, sessionStartsAt, platformFeeCents) {
  const refund = calculateGuestRefund(totalAmountCents, sessionStartsAt, platformFeeCents)
  return guestRefundTier(sessionStartsAt).describe(refund)
}
