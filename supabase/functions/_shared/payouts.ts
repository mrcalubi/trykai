const HOLD_MS = 24 * 60 * 60 * 1000

// Platform Stripe payouts must be manual (ops). Auto-payout would drain the
// platform balance before these Transfers run.

export interface PayoutCandidate {
  id: string
  status: string
  payout_released_at: string | null
  stripe_refund_id: string | null
  host_payout_amount: number | null
  stripe_charge_id: string | null
  starts_at: string
  stripe_account_id: string | null
  stripe_payouts_enabled: boolean | null
}

export function isPayoutDue(booking: PayoutCandidate, nowMs = Date.now()): boolean {
  if (booking.status !== 'confirmed') return false
  if (booking.payout_released_at) return false
  if (booking.stripe_refund_id) return false
  if (!booking.host_payout_amount || booking.host_payout_amount <= 0) return false
  if (!booking.stripe_charge_id) return false
  if (!booking.stripe_account_id) return false
  if (!booking.stripe_payouts_enabled) return false
  const sessionStart = new Date(booking.starts_at).getTime()
  if (Number.isNaN(sessionStart)) return false
  return sessionStart + HOLD_MS <= nowMs
}

export function transferCreateParams(booking: PayoutCandidate): {
  amount: number
  currency: 'sgd'
  destination: string
  transfer_group: string
  source_transaction: string
  metadata: { booking_id: string }
} {
  return {
    amount: booking.host_payout_amount as number,
    currency: 'sgd',
    destination: booking.stripe_account_id as string,
    transfer_group: booking.id,
    source_transaction: booking.stripe_charge_id as string,
    metadata: { booking_id: booking.id },
  }
}
