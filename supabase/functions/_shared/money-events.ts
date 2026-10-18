import type { AdminActor } from './admin-auth.ts'

// Rows for public.booking_money_events (00030): the append-only, admin-only
// log of payout holds, dispute refunds, and admin cancels. Pure so vitest
// covers the shape the table's CHECK constraints expect.

export type MoneyEventAction = 'hold' | 'release_hold' | 'partial_refund' | 'admin_cancel'

/** A webhook or job acting without a person (e.g. a chargeback hold). */
export type SystemActor = { method: 'system'; userId: null; operator: string }

export type MoneyEventActor = AdminActor | SystemActor

export interface MoneyEventRow {
  booking_id: string
  action: MoneyEventAction
  actor_user_id: string | null
  auth_method: MoneyEventActor['method']
  amount_cents: number | null
  host_payout_before: number | null
  host_payout_after: number | null
  stripe_object_id: string | null
  note: string | null
}

/** Longest note an operator may send; the table allows 2000 after prefixes. */
export const MAX_NOTE_LENGTH = 1500
const MAX_STORED_NOTE_LENGTH = 2000

export type NoteRefusal = { ok: false; status: 400; error: string }

export function cleanNote(
  value: unknown,
  options: { required?: boolean; field?: string } = {},
): { ok: true; note: string | null } | NoteRefusal {
  const field = options.field ?? 'note'
  if (value != null && typeof value !== 'string') {
    return { ok: false, status: 400, error: `${field} must be text` }
  }
  const note = typeof value === 'string' ? value.trim() : ''
  if (!note) {
    return options.required
      ? { ok: false, status: 400, error: `${field} is required` }
      : { ok: true, note: null }
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return { ok: false, status: 400, error: `${field} must be ${MAX_NOTE_LENGTH} characters or fewer` }
  }
  return { ok: true, note }
}

function joinNote(parts: Array<string | null | undefined>): string | null {
  const text = parts.filter((part) => part && part.length > 0).join(': ')
  return text ? text.slice(0, MAX_STORED_NOTE_LENGTH) : null
}

export function moneyEventRow(input: {
  bookingId: string
  action: MoneyEventAction
  actor: MoneyEventActor
  amountCents?: number | null
  hostPayoutBefore?: number | null
  hostPayoutAfter?: number | null
  stripeObjectId?: string | null
  note?: string | null
}): MoneyEventRow {
  const { actor } = input
  // Without a user id the note is the only record of who acted.
  const who =
    actor.method === 'break_glass'
      ? `[break-glass: ${actor.operator}]`
      : actor.method === 'system'
        ? `[system: ${actor.operator}]`
        : null
  const note = joinNote([input.note])
  return {
    booking_id: input.bookingId,
    action: input.action,
    actor_user_id: actor.method === 'admin_jwt' ? actor.userId : null,
    auth_method: actor.method,
    amount_cents: input.amountCents ?? null,
    host_payout_before: input.hostPayoutBefore ?? null,
    host_payout_after: input.hostPayoutAfter ?? null,
    stripe_object_id: input.stripeObjectId ?? null,
    note: who ? (note ? `${who} ${note}` : who).slice(0, MAX_STORED_NOTE_LENGTH) : note,
  }
}

interface PayoutRow {
  id: string
  host_payout_amount: number | null
}

/** Hold: the note keeps the neutral code, so history survives the release. */
export function holdEvent(
  booking: PayoutRow,
  actor: MoneyEventActor,
  hold: { code: string; note: string | null },
): MoneyEventRow {
  return moneyEventRow({
    bookingId: booking.id,
    action: 'hold',
    actor,
    hostPayoutBefore: booking.host_payout_amount,
    hostPayoutAfter: booking.host_payout_amount,
    note: joinNote([hold.code, hold.note]),
  })
}

export function releaseHoldEvent(
  booking: PayoutRow & { payout_hold_reason: string | null },
  actor: MoneyEventActor,
  note: string | null,
): MoneyEventRow {
  return moneyEventRow({
    bookingId: booking.id,
    action: 'release_hold',
    actor,
    hostPayoutBefore: booking.host_payout_amount,
    hostPayoutAfter: booking.host_payout_amount,
    note: joinNote([booking.payout_hold_reason, note]),
  })
}

export function partialRefundEvent(
  booking: PayoutRow,
  actor: MoneyEventActor,
  refund: { refundCents: number; newHostPayoutCents: number; stripeRefundId: string; note: string | null },
): MoneyEventRow {
  return moneyEventRow({
    bookingId: booking.id,
    action: 'partial_refund',
    actor,
    amountCents: refund.refundCents,
    hostPayoutBefore: booking.host_payout_amount,
    hostPayoutAfter: refund.newHostPayoutCents,
    stripeObjectId: refund.stripeRefundId,
    note: refund.note,
  })
}

/**
 * Admin cancel. host_payout_after is what the host will actually be paid:
 * the column is left as it was, but a full refund (stripe_refund_id) stops
 * release-payout, so it is 0 unless the payout had already gone out.
 */
export function adminCancelEvent(
  booking: PayoutRow & { payout_released_at: string | null },
  actor: MoneyEventActor,
  cancel: { reason: string; refundedNowCents: number; stripeRefundId: string | null; note: string | null },
): MoneyEventRow {
  const before = booking.host_payout_amount
  return moneyEventRow({
    bookingId: booking.id,
    action: 'admin_cancel',
    actor,
    amountCents: cancel.refundedNowCents,
    hostPayoutBefore: before,
    hostPayoutAfter: booking.payout_released_at ? before : 0,
    stripeObjectId: cancel.stripeRefundId,
    note: joinNote([cancel.reason, cancel.note]),
  })
}

/**
 * Inserts the event after the money has moved. A failed insert is logged in
 * full and reported back, never thrown: the action itself already happened,
 * and a retry of a refund would move money twice.
 */
export async function recordMoneyEvent(
  insert: (row: MoneyEventRow) => PromiseLike<{ error: { message: string } | null }>,
  row: MoneyEventRow,
  log: (...args: unknown[]) => void = console.error,
): Promise<{ audit_logged: true } | { audit_logged: false; audit_error: string }> {
  let message: string | null
  try {
    const { error } = await insert(row)
    message = error ? error.message : null
  } catch (err) {
    message = err instanceof Error ? err.message : String(err)
  }
  if (message === null) return { audit_logged: true }
  log('booking_money_events insert failed; record this by hand', JSON.stringify(row), message)
  return {
    audit_logged: false,
    audit_error: `The action succeeded but its audit row was not saved (${message}). Insert it by hand (OPERATIONS.md, Guest dispute refund).`,
  }
}
