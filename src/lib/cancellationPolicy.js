// The tiers below are the published Cancellation Policy, in code. Anything that
// changes what a guest is refunded should change this table and the wording on
// src/pages/CancellationPolicy.jsx together.
//
// A guest pays `total_amount`, and the platform fee is carved out of it rather
// than added on top. So "the lesson fee" is `total_amount - platform_fee`, and a
// refund "including the platform fee" is the whole `total_amount`.

// Legacy fallback only: bookings taken before `platform_fee` was stored used a
// 15% carve-out. Live charges use calculateGuestCharge in booking.ts.
export const PLATFORM_FEE_RATE = 0.15

export const CANCELLATION_POLICY_ITEMS = [
  {
    scenario: 'Guest cancels 48+ hours before session',
    resolution: 'Full refund, including the platform fee',
  },
  {
    scenario: 'Guest cancels 24–48 hours before session',
    resolution: '50% of the lesson fee refunded (platform fee not refunded)',
  },
  {
    scenario: 'Guest cancels 6–24 hours before session',
    resolution: '25% of the lesson fee refunded (platform fee not refunded)',
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
    lessonFeeShare: 1,
    refundsPlatformFee: true,
    describe: (refund) =>
      `Full refund of ${formatCents(refund)}, including the platform fee ` +
      `(cancelled 48 or more hours before the session).`,
  },
  {
    id: 'half',
    minHoursBefore: 24,
    lessonFeeShare: 0.5,
    refundsPlatformFee: false,
    describe: (refund) =>
      `Partial refund of ${formatCents(refund)} — 50% of the lesson fee ` +
      `(cancelled 24 to 48 hours before the session). The platform fee is not refunded.`,
  },
  {
    id: 'quarter',
    minHoursBefore: 6,
    lessonFeeShare: 0.25,
    refundsPlatformFee: false,
    describe: (refund) =>
      `Partial refund of ${formatCents(refund)} — 25% of the lesson fee ` +
      `(cancelled 6 to 24 hours before the session). The platform fee is not refunded.`,
  },
  {
    id: 'none',
    minHoursBefore: Number.NEGATIVE_INFINITY,
    lessonFeeShare: 0,
    refundsPlatformFee: false,
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

/**
 * Bookings taken before `platform_fee` was recorded fall back to the rate the fee
 * was originally charged at, so an old row is never treated as fee-free.
 */
function platformFeeOf(totalAmountCents, platformFeeCents) {
  return Number.isFinite(platformFeeCents)
    ? platformFeeCents
    : Math.round(totalAmountCents * PLATFORM_FEE_RATE)
}

export function calculateGuestRefund(totalAmountCents, sessionStartsAt, platformFeeCents) {
  const tier = guestRefundTier(sessionStartsAt)

  if (tier.refundsPlatformFee) return totalAmountCents
  if (tier.lessonFeeShare === 0) return 0

  const lessonFee = totalAmountCents - platformFeeOf(totalAmountCents, platformFeeCents)
  return Math.round(lessonFee * tier.lessonFeeShare)
}

export function guestRefundDescription(totalAmountCents, sessionStartsAt, platformFeeCents) {
  const refund = calculateGuestRefund(totalAmountCents, sessionStartsAt, platformFeeCents)
  return guestRefundTier(sessionStartsAt).describe(refund)
}
