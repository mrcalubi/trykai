import { bookingReference, escapeHtml, formatCents, formatSessionDate } from './email.ts'
import { moneyEventRow, type MoneyEventRow, type SystemActor } from './money-events.ts'

// Money that moved in Stripe without a TryKai function starting it: card
// chargebacks (charge.dispute.*) and refunds made in the Stripe Dashboard
// (charge.refunded). Pure so vitest and `deno check` cover them without
// Stripe or Supabase; stripe-webhook does the reads and writes.

export interface ChargebackBooking {
  id: string
  payout_released_at: string | null
  payout_hold_reason: string | null
  stripe_refund_id: string | null
  refund_amount: number | null
  stripe_partial_refund_ids?: string[] | null
  host_payout_amount?: number | null
}

export interface StripeDisputeLike {
  id: string
  charge?: string | { id?: string } | null
  payment_intent?: string | { id?: string } | null
  amount: number
  currency: string
  reason?: string | null
  status?: string | null
  evidence_details?: { due_by?: number | null } | null
}

export interface StripeRefundLike {
  id: string
  status?: string | null
  metadata?: Record<string, string> | null
}

/** Stripe sends a related object as its id, or expanded with an id. */
export function stripeObjectId(value: string | { id?: string } | null | undefined): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.length > 0) {
    return value.id
  }
  return null
}

/**
 * The guest and host can read payout_hold_reason (00029), and 00030 limits it
 * to 'dispute' or 'chargeback'. The dispute id goes in booking_money_events.
 */
export const CHARGEBACK_HOLD_CODE = 'chargeback'

export const CHARGEBACK_ACTOR: SystemActor = {
  method: 'system',
  userId: null,
  operator: 'stripe-webhook',
}

export type ChargebackHoldPlan =
  | { kind: 'hold'; patch: { payout_hold_reason: string; payout_held_at: string } }
  | { kind: 'already_held' }
  | { kind: 'payout_released' }

/**
 * A chargeback debits the platform plus a dispute fee, so the host payout is
 * held while it is open. It replaces an admin dispute hold's reason, since a
 * chargeback outranks a quality complaint. It is never cleared here.
 */
export function planChargebackHold(booking: ChargebackBooking, nowIso: string): ChargebackHoldPlan {
  if (booking.payout_released_at) return { kind: 'payout_released' }
  if (booking.payout_hold_reason === CHARGEBACK_HOLD_CODE) return { kind: 'already_held' }
  return {
    kind: 'hold',
    patch: { payout_hold_reason: CHARGEBACK_HOLD_CODE, payout_held_at: nowIso },
  }
}

/**
 * Audit row for a chargeback hold (00030). The note starts with the code and
 * names the dispute, so the history keeps both after the hold is cleared.
 */
export function chargebackHoldEvent(
  booking: ChargebackBooking,
  dispute: StripeDisputeLike,
): MoneyEventRow {
  const payout = booking.host_payout_amount ?? null
  return moneyEventRow({
    bookingId: booking.id,
    action: 'hold',
    actor: CHARGEBACK_ACTOR,
    amountCents: dispute.amount,
    hostPayoutBefore: payout,
    hostPayoutAfter: payout,
    stripeObjectId: dispute.id,
    note: `${CHARGEBACK_HOLD_CODE}: ${dispute.id}, bank reason ${formatDisputeReason(dispute.reason)}${
      booking.payout_hold_reason ? `, replaced hold "${booking.payout_hold_reason}"` : ''
    }`,
  })
}

/** A refund that a TryKai function made and records itself (it sets metadata.booking_id). */
function isRecordedByTryKai(refund: StripeRefundLike): boolean {
  return Boolean(refund.metadata?.booking_id)
}

function counts(refund: StripeRefundLike): boolean {
  return refund.status !== 'failed' && refund.status !== 'canceled'
}

/**
 * Columns that bring a booking in line with refunds made in the Stripe
 * Dashboard, or null when it already matches. refund_amount only ever goes
 * up, to the charge's amount_refunded. Refunds tagged with metadata.booking_id
 * are skipped: admin-dispute-booking writes those itself under an optimistic
 * lock on refund_amount, and racing it would fail that write.
 */
export function refundReconcilePatch(
  booking: ChargebackBooking,
  charge: { amount_refunded?: number | null },
  refunds: StripeRefundLike[],
): { refund_amount?: number; stripe_partial_refund_ids?: string[] } | null {
  const known = new Set<string>(booking.stripe_partial_refund_ids ?? [])
  if (booking.stripe_refund_id) known.add(booking.stripe_refund_id)
  const added = refunds
    .filter((refund) => counts(refund) && !isRecordedByTryKai(refund) && !known.has(refund.id))
    .map((refund) => refund.id)
  const unique = [...new Set(added)]

  const patch: { refund_amount?: number; stripe_partial_refund_ids?: string[] } = {}
  const amountRefunded = charge.amount_refunded ?? 0
  if (amountRefunded > (booking.refund_amount ?? 0)) patch.refund_amount = amountRefunded
  if (unique.length > 0) {
    patch.stripe_partial_refund_ids = [...(booking.stripe_partial_refund_ids ?? []), ...unique]
  }
  return Object.keys(patch).length > 0 ? patch : null
}

function disputeAmount(dispute: StripeDisputeLike): string {
  return `${formatCents(dispute.amount)} ${String(dispute.currency ?? '').toUpperCase()}`.trim()
}

/** "product_not_received" → "product not received". */
export function formatDisputeReason(reason: string | null | undefined): string {
  if (!reason) return 'not given'
  return reason.replace(/_/g, ' ')
}

/** evidence_details.due_by is Unix seconds; shown in Singapore time. */
export function formatEvidenceDueBy(dueBy: number | null | undefined): string {
  if (typeof dueBy !== 'number' || !Number.isFinite(dueBy) || dueBy <= 0) return 'not given'
  return `${formatSessionDate(new Date(dueBy * 1000).toISOString())} SGT`
}

export function stripeDisputeUrl(disputeId: string, livemode: boolean): string {
  return `https://dashboard.stripe.com/${livemode ? '' : 'test/'}disputes/${disputeId}`
}

export type ChargebackHoldOutcome =
  | 'held'
  | 'already_held'
  | 'payout_released'
  | 'no_booking'

const HOLD_OUTCOME_COPY: Record<ChargebackHoldOutcome, string> = {
  held: 'The host payout is now held (release-payout skips it as dispute_hold).',
  already_held: 'The host payout was already held for this chargeback.',
  payout_released:
    'The host was already paid. If the dispute is lost, TryKai carries the amount and the fee unless it is recovered from the host (Transfer → Reverse, after telling them).',
  no_booking:
    'No booking matched this charge, so nothing was held. Find it in Stripe and check bookings by hand.',
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:2px 12px 2px 0;color:#666;">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`
}

export function chargebackOpenedEmail(options: {
  dispute: StripeDisputeLike
  bookingId: string | null
  outcome: ChargebackHoldOutcome
  previousHoldReason?: string | null
  auditError?: string | null
  livemode: boolean
}): { subject: string; html: string } {
  const { dispute, bookingId, outcome, previousHoldReason, auditError, livemode } = options
  const reference = bookingId ? bookingReference(bookingId) : 'no booking found'
  const replaced =
    outcome === 'held' && previousHoldReason
      ? `<p>It replaced the earlier hold reason "${escapeHtml(previousHoldReason)}".</p>`
      : ''
  return {
    subject: `Chargeback opened: ${reference}, ${disputeAmount(dispute)}`,
    html: `
      <h2>Card chargeback opened</h2>
      <table role="presentation" cellpadding="0" cellspacing="0">
        ${row('Booking reference', reference)}
        ${bookingId ? row('Booking id', bookingId) : ''}
        ${row('Amount', disputeAmount(dispute))}
        ${row('Reason', formatDisputeReason(dispute.reason))}
        ${row('Status', dispute.status ?? 'unknown')}
        ${row('Evidence due by', formatEvidenceDueBy(dispute.evidence_details?.due_by))}
        ${row('Dispute', dispute.id)}
      </table>
      <p>${escapeHtml(HOLD_OUTCOME_COPY[outcome])}</p>
      ${replaced}
      ${auditError ? `<p><strong>${escapeHtml(auditError)}</strong></p>` : ''}
      <p><a href="${stripeDisputeUrl(dispute.id, livemode)}">Respond in Stripe</a> before the evidence deadline. Runbook: OPERATIONS.md, Card chargeback.</p>
    `,
  }
}

const CLOSED_STATUS_COPY: Record<string, string> = {
  won: 'TryKai won. Stripe returns the disputed amount to the platform balance.',
  lost: 'TryKai lost. The disputed amount and the dispute fee stay debited from the platform balance.',
  warning_closed: 'The inquiry closed without becoming a chargeback.',
}

export function disputeClosedOutcome(status: string | null | undefined): string {
  return CLOSED_STATUS_COPY[status ?? ''] ?? `Closed with status "${status ?? 'unknown'}".`
}

export function chargebackClosedEmail(options: {
  dispute: StripeDisputeLike
  bookingId: string | null
  payoutHoldReason: string | null
  livemode: boolean
}): { subject: string; html: string } {
  const { dispute, bookingId, payoutHoldReason, livemode } = options
  const reference = bookingId ? bookingReference(bookingId) : 'no booking found'
  const hold = payoutHoldReason
    ? `The payout hold ("${escapeHtml(payoutHoldReason)}") was not cleared. Decide what the host is owed, then use admin-dispute-booking (release_hold or partial_refund) or admin-cancel-booking.`
    : 'The booking has no payout hold.'
  return {
    subject: `Chargeback ${dispute.status ?? 'closed'}: ${reference}, ${disputeAmount(dispute)}`,
    html: `
      <h2>Card chargeback closed</h2>
      <table role="presentation" cellpadding="0" cellspacing="0">
        ${row('Booking reference', reference)}
        ${bookingId ? row('Booking id', bookingId) : ''}
        ${row('Amount', disputeAmount(dispute))}
        ${row('Reason', formatDisputeReason(dispute.reason))}
        ${row('Outcome', dispute.status ?? 'unknown')}
        ${row('Dispute', dispute.id)}
      </table>
      <p>${escapeHtml(disputeClosedOutcome(dispute.status))}</p>
      <p>${hold}</p>
      <p><a href="${stripeDisputeUrl(dispute.id, livemode)}">View in Stripe</a>. Runbook: OPERATIONS.md, Card chargeback.</p>
    `,
  }
}
