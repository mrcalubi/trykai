export const CANCELLATION_POLICY_ITEMS = [
  { scenario: 'Guest cancels 48+ hours before session', resolution: 'Full refund' },
  { scenario: 'Guest cancels under 48 hours before session', resolution: '50% refund (host keeps 50%)' },
  { scenario: 'Host cancels anytime', resolution: 'Full refund to guest + host receives a strike' },
  { scenario: '3 host strikes', resolution: 'Listing is automatically deactivated' },
]

export function formatCents(cents) {
  const dollars = cents / 100
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

export function calculateGuestRefund(totalAmountCents, sessionStartsAt) {
  const hoursUntil =
    (new Date(sessionStartsAt).getTime() - Date.now()) / (1000 * 60 * 60)

  if (hoursUntil >= 48) {
    return totalAmountCents
  }

  return Math.round(totalAmountCents * 0.5)
}

export function guestRefundDescription(totalAmountCents, sessionStartsAt) {
  const refund = calculateGuestRefund(totalAmountCents, sessionStartsAt)
  const hoursUntil =
    (new Date(sessionStartsAt).getTime() - Date.now()) / (1000 * 60 * 60)

  if (hoursUntil >= 48) {
    return `Full refund of ${formatCents(refund)} (cancelled more than 48 hours before the session).`
  }

  return `Partial refund of ${formatCents(refund)} (50% — cancelled less than 48 hours before the session).`
}
