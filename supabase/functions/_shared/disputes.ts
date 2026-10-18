import { formatCents } from './email.ts'
import { cleanNote } from './money-events.ts'

// Rules for admin-dispute-booking. Pure so vitest and `deno check` cover them
// without Stripe or Supabase.

export interface DisputeBooking {
  id: string
  status: string
  total_amount: number
  refund_amount: number | null
  host_payout_amount: number | null
  stripe_payment_id: string | null
  stripe_refund_id: string | null
  payout_released_at: string | null
  payout_hold_reason: string | null
  stripe_partial_refund_ids?: string[] | null
}

export type DisputeAction = 'hold' | 'release_hold' | 'partial_refund'

export type DisputeRefusal = { ok: false; status: number; error: string }

/**
 * The only values bookings.payout_hold_reason may hold (00030 CHECK). The
 * guest and host can read the column, so details go in the admin-only
 * booking_money_events note instead.
 */
export const HOLD_CODES = ['dispute', 'chargeback'] as const
export type HoldCode = (typeof HOLD_CODES)[number]

export function parseDisputeAction(value: unknown): DisputeAction | null {
  if (value === 'hold' || value === 'release_hold' || value === 'partial_refund') return value
  return null
}

function isWholeCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

/**
 * Only a confirmed booking whose payout has not gone out can be held.
 * `reason` is a neutral code (default 'dispute'); `note` is the free-text
 * why, required, and stored only in booking_money_events.
 */
export function checkHold(
  booking: DisputeBooking,
  input: { reason: unknown; note: unknown },
): { ok: true; code: HoldCode; note: string } | DisputeRefusal {
  const code = input.reason ?? 'dispute'
  if (!HOLD_CODES.includes(code as HoldCode)) {
    return {
      ok: false,
      status: 400,
      error: `reason must be ${HOLD_CODES.map((c) => `'${c}'`).join(' or ')}. The guest and host can read it; put details in note.`,
    }
  }
  const note = cleanNote(input.note, { required: true })
  if (!note.ok) return note
  if (booking.status !== 'confirmed') {
    return { ok: false, status: 409, error: `Booking is ${booking.status}, not confirmed` }
  }
  if (booking.stripe_refund_id) {
    return { ok: false, status: 409, error: 'Booking is already fully refunded' }
  }
  if (booking.payout_released_at) {
    return {
      ok: false,
      status: 409,
      error:
        'Payout was already released to the host; there is nothing to hold. Use partial_refund within what TryKai can absorb, or recover from the host by hand.',
    }
  }
  return { ok: true, code: code as HoldCode, note: note.note as string }
}

export interface PartialRefundPlan {
  ok: true
  refundCents: number
  newHostPayoutCents: number
  totalRefundedCents: number
  platformKeepsCents: number
  payoutReleased: boolean
  idempotencyKey: string
}

/**
 * Validates a partial dispute refund. Money conservation: guest refunds plus
 * the host payout can never exceed what the guest paid, so TryKai's share is
 * never negative. After release the host payout is fixed (no clawback here),
 * so the refund has to fit inside TryKai's own share.
 */
export function planPartialRefund(
  booking: DisputeBooking,
  input: { refundCents: unknown; newHostPayoutCents: unknown },
): PartialRefundPlan | DisputeRefusal {
  const { refundCents, newHostPayoutCents } = input
  if (!isWholeCents(refundCents) || refundCents <= 0) {
    return { ok: false, status: 400, error: 'refund_amount_cents must be a positive whole number of cents' }
  }
  if (booking.status !== 'confirmed') {
    return { ok: false, status: 409, error: `Booking is ${booking.status}, not confirmed` }
  }
  if (booking.stripe_refund_id) {
    return { ok: false, status: 409, error: 'Booking is already fully refunded' }
  }
  if (!booking.stripe_payment_id) {
    return { ok: false, status: 409, error: 'Booking has no Stripe PaymentIntent to refund' }
  }

  const paid = booking.total_amount
  const alreadyRefunded = booking.refund_amount ?? 0
  const currentHostPayout = booking.host_payout_amount ?? 0
  const refundable = paid - alreadyRefunded
  if (refundCents > refundable) {
    return {
      ok: false,
      status: 400,
      error: `Refund ${formatCents(refundCents)} is more than the ${formatCents(refundable)} the guest has left to refund`,
    }
  }

  const payoutReleased = Boolean(booking.payout_released_at)
  let hostPayout: number
  if (payoutReleased) {
    if (newHostPayoutCents != null && newHostPayoutCents !== currentHostPayout) {
      return {
        ok: false,
        status: 409,
        error: `Payout of ${formatCents(currentHostPayout)} was already released; new_host_payout_cents cannot change it. Omit it, or recover from the host by hand.`,
      }
    }
    hostPayout = currentHostPayout
    const absorbable = paid - alreadyRefunded - currentHostPayout
    if (refundCents > absorbable) {
      return {
        ok: false,
        status: 409,
        error: `Payout of ${formatCents(currentHostPayout)} was already released. TryKai can absorb at most ${formatCents(Math.max(0, absorbable))} from this booking, not ${formatCents(refundCents)}. Recover the rest from the host first (OPERATIONS.md, Guest dispute refund).`,
      }
    }
  } else {
    if (!booking.payout_hold_reason) {
      return {
        ok: false,
        status: 409,
        error: 'Place a dispute hold first (action "hold") so release-payout cannot pay the host mid-refund',
      }
    }
    if (!isWholeCents(newHostPayoutCents) || newHostPayoutCents < 0) {
      return {
        ok: false,
        status: 400,
        error: 'new_host_payout_cents must be a whole number of cents, 0 or more',
      }
    }
    if (newHostPayoutCents > currentHostPayout) {
      return {
        ok: false,
        status: 400,
        error: `new_host_payout_cents ${formatCents(newHostPayoutCents)} is more than the current host payout ${formatCents(currentHostPayout)}`,
      }
    }
    hostPayout = newHostPayoutCents
    if (refundCents + alreadyRefunded + hostPayout > paid) {
      return {
        ok: false,
        status: 400,
        error: `Refunds of ${formatCents(refundCents + alreadyRefunded)} plus a host payout of ${formatCents(hostPayout)} exceed the ${formatCents(paid)} the guest paid. Lower new_host_payout_cents.`,
      }
    }
  }

  const totalRefundedCents = alreadyRefunded + refundCents
  return {
    ok: true,
    refundCents,
    newHostPayoutCents: hostPayout,
    totalRefundedCents,
    platformKeepsCents: paid - totalRefundedCents - hostPayout,
    payoutReleased,
    // Same booking, same prior total, same amount: a retry after a failed DB
    // write gets the original Stripe refund back instead of a second one.
    idempotencyKey: `dispute-refund:${booking.id}:${alreadyRefunded}:${refundCents}`,
  }
}

/** Columns written after Stripe accepts a partial refund. Clears the hold. */
export function partialRefundPatch(
  booking: DisputeBooking,
  plan: PartialRefundPlan,
  stripeRefundId: string,
): Record<string, unknown> {
  const ids = booking.stripe_partial_refund_ids ?? []
  const patch: Record<string, unknown> = {
    refund_amount: plan.totalRefundedCents,
    stripe_partial_refund_ids: ids.includes(stripeRefundId) ? ids : [...ids, stripeRefundId],
    payout_hold_reason: null,
    payout_held_at: null,
  }
  if (!plan.payoutReleased) patch.host_payout_amount = plan.newHostPayoutCents
  return patch
}
