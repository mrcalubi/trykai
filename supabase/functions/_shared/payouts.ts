import { chargeIdFromPaymentIntent } from './http.ts'

export const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000

// Platform Stripe payouts must be manual (ops). Auto-payout would drain the
// platform balance before these Transfers run. Transfers always pin
// source_transaction to the original charge so a drained platform balance
// fails loudly instead of paying the host from a later guest's funds.

export interface PayoutCandidate {
  id: string
  status: string
  payout_released_at: string | null
  stripe_refund_id: string | null
  host_payout_amount: number | null
  stripe_charge_id: string | null
  stripe_payment_id?: string | null
  starts_at: string
  stripe_account_id: string | null
  stripe_payouts_enabled: boolean | null
}

export type PayoutSkipReason =
  | 'not_confirmed'
  | 'already_released'
  | 'refunded'
  | 'no_host_share'
  | 'missing_charge_id'
  | 'host_not_connected'
  | 'host_payouts_disabled'
  | 'invalid_starts_at'
  | 'hold_not_elapsed'

export function payoutSkipReason(
  booking: PayoutCandidate,
  nowMs = Date.now(),
): PayoutSkipReason | null {
  if (booking.status !== 'confirmed') return 'not_confirmed'
  if (booking.payout_released_at) return 'already_released'
  if (booking.stripe_refund_id) return 'refunded'
  if (!booking.host_payout_amount || booking.host_payout_amount <= 0) return 'no_host_share'
  if (!booking.stripe_charge_id) return 'missing_charge_id'
  if (!booking.stripe_account_id) return 'host_not_connected'
  if (!booking.stripe_payouts_enabled) return 'host_payouts_disabled'
  const sessionStart = new Date(booking.starts_at).getTime()
  if (Number.isNaN(sessionStart)) return 'invalid_starts_at'
  if (sessionStart + PAYOUT_HOLD_MS > nowMs) return 'hold_not_elapsed'
  return null
}

export function isPayoutDue(booking: PayoutCandidate, nowMs = Date.now()): boolean {
  return payoutSkipReason(booking, nowMs) === null
}

export async function resolveChargeId(
  booking: Pick<PayoutCandidate, 'stripe_charge_id' | 'stripe_payment_id'>,
  retrieve: (paymentIntentId: string) => Promise<{
    latest_charge?: string | { id?: string } | null
  }>,
): Promise<string | null> {
  if (booking.stripe_charge_id) return booking.stripe_charge_id
  if (!booking.stripe_payment_id) return null
  const paymentIntent = await retrieve(booking.stripe_payment_id)
  return chargeIdFromPaymentIntent(paymentIntent)
}

export function countSkipReasons(
  skipped: { reason: PayoutSkipReason }[],
): Partial<Record<PayoutSkipReason, number>> {
  const counts: Partial<Record<PayoutSkipReason, number>> = {}
  for (const row of skipped) {
    counts[row.reason] = (counts[row.reason] ?? 0) + 1
  }
  return counts
}

export function summarisePayoutRun(input: {
  scanned: number
  dueIds: string[]
  released: string[]
  failed: { id: string; error: string }[]
  skipped: { id: string; reason: PayoutSkipReason }[]
}): {
  scanned: number
  due: number
  released: string[]
  failed: { id: string; error: string }[]
  skipped_by_reason: Partial<Record<PayoutSkipReason, number>>
  skipped: { id: string; reason: PayoutSkipReason }[]
} {
  return {
    scanned: input.scanned,
    due: input.dueIds.length,
    released: input.released,
    failed: input.failed,
    skipped_by_reason: countSkipReasons(input.skipped),
    skipped: input.skipped.filter((row) => row.reason !== 'hold_not_elapsed'),
  }
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
