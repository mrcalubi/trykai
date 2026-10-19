import { describe, expect, it } from 'vitest'
import { MAX_NOTE_LENGTH } from './money-events.ts'
import {
  HOLD_CODES,
  checkHold,
  parseDisputeAction,
  partialRefundPatch,
  planPartialRefund,
  type DisputeBooking,
  type PartialRefundPlan,
} from './disputes.ts'

function booking(overrides: Partial<DisputeBooking> = {}): DisputeBooking {
  return {
    id: 'booking-1',
    status: 'confirmed',
    total_amount: 5000,
    refund_amount: null,
    host_payout_amount: 4000,
    stripe_payment_id: 'pi_1',
    stripe_refund_id: null,
    payout_released_at: null,
    payout_hold_reason: 'dispute',
    stripe_partial_refund_ids: [],
    ...overrides,
  }
}

function plan(b: DisputeBooking, refundCents: unknown, newHostPayoutCents?: unknown) {
  return planPartialRefund(b, { refundCents, newHostPayoutCents })
}

describe('parseDisputeAction', () => {
  it('accepts the three actions and nothing else', () => {
    expect(parseDisputeAction('hold')).toBe('hold')
    expect(parseDisputeAction('release_hold')).toBe('release_hold')
    expect(parseDisputeAction('partial_refund')).toBe('partial_refund')
    expect(parseDisputeAction('refund')).toBeNull()
    expect(parseDisputeAction(undefined)).toBeNull()
  })
})

describe('checkHold', () => {
  const note = 'Guest says the host arrived 40 minutes late'

  it('accepts a neutral code and a trimmed note on a confirmed, unpaid booking', () => {
    expect(
      checkHold(booking({ payout_hold_reason: null }), { reason: 'chargeback', note: `  ${note}  ` }),
    ).toEqual({ ok: true, code: 'chargeback', note })
  })

  it("defaults the code to 'dispute'", () => {
    expect(checkHold(booking(), { reason: undefined, note })).toMatchObject({ ok: true, code: 'dispute' })
    expect(HOLD_CODES).toEqual(['dispute', 'chargeback'])
  })

  it('refuses free text as the code, because the guest and host can read it', () => {
    const result = checkHold(booking(), { reason: 'dispute: host 40 min late', note })
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toMatch(/put details in note/)
    expect(checkHold(booking(), { reason: 42, note })).toMatchObject({ ok: false, status: 400 })
  })

  it('requires a note of bounded length', () => {
    expect(checkHold(booking(), { reason: 'dispute', note: '' })).toMatchObject({ ok: false, status: 400 })
    expect(checkHold(booking(), { reason: 'dispute', note: 42 })).toMatchObject({ ok: false, status: 400 })
    expect(
      checkHold(booking(), { reason: 'dispute', note: 'x'.repeat(MAX_NOTE_LENGTH + 1) }),
    ).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses bookings that are not payable', () => {
    expect(checkHold(booking({ status: 'cancelled' }), { reason: 'dispute', note: 'r' })).toMatchObject({
      ok: false,
      status: 409,
      error: 'Booking is cancelled, not confirmed',
    })
    expect(checkHold(booking({ stripe_refund_id: 're_1' }), { reason: 'dispute', note: 'r' })).toMatchObject({
      ok: false,
      status: 409,
    })
  })

  it('explains that a released payout cannot be held', () => {
    const result = checkHold(booking({ payout_released_at: '2026-10-01T00:00:00Z' }), {
      reason: 'dispute',
      note: 'r',
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(!result.ok && result.error).toMatch(/already released/)
  })
})

describe('planPartialRefund before release', () => {
  it('splits the money and keys the Stripe call to the prior refund total', () => {
    expect(plan(booking(), 1500, 2800)).toEqual({
      ok: true,
      refundCents: 1500,
      newHostPayoutCents: 2800,
      totalRefundedCents: 1500,
      platformKeepsCents: 700,
      payoutReleased: false,
      idempotencyKey: 'dispute-refund:booking-1:0:1500',
    })
  })

  it('adds to an earlier partial refund', () => {
    const result = plan(booking({ refund_amount: 1000, host_payout_amount: 3500 }), 500, 3000)
    expect(result).toMatchObject({
      ok: true,
      totalRefundedCents: 1500,
      platformKeepsCents: 500,
      idempotencyKey: 'dispute-refund:booking-1:1000:500',
    })
  })

  it('allows a zero host payout', () => {
    expect(plan(booking(), 2000, 0)).toMatchObject({ ok: true, newHostPayoutCents: 0 })
  })

  it('requires the hold so release-payout cannot race the refund', () => {
    const result = plan(booking({ payout_hold_reason: null }), 1000, 3000)
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(!result.ok && result.error).toMatch(/hold/)
  })

  it('rejects bad amounts', () => {
    expect(plan(booking(), 0, 3000)).toMatchObject({ ok: false, status: 400 })
    expect(plan(booking(), 10.5, 3000)).toMatchObject({ ok: false, status: 400 })
    expect(plan(booking(), '1000', 3000)).toMatchObject({ ok: false, status: 400 })
    expect(plan(booking(), 1000)).toMatchObject({ ok: false, status: 400 })
    expect(plan(booking(), 1000, -1)).toMatchObject({ ok: false, status: 400 })
  })

  it('never raises the host payout', () => {
    const result = plan(booking(), 500, 4500)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toMatch(/more than the current host payout \$40/)
  })

  it('never refunds more than the guest has left', () => {
    const result = plan(booking({ refund_amount: 4000, host_payout_amount: 0 }), 1500, 0)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toBe(
      'Refund $15 is more than the $10 the guest has left to refund',
    )
  })

  it('never lets refunds plus host payout exceed what the guest paid', () => {
    const result = plan(booking(), 1500, 4000)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toMatch(/Lower new_host_payout_cents/)
  })

  it('treats a missing host payout as zero', () => {
    expect(plan(booking({ host_payout_amount: null }), 1000, 0)).toMatchObject({ ok: true })
  })
})

describe('planPartialRefund after release', () => {
  const released = booking({
    payout_released_at: '2026-10-01T00:00:00Z',
    payout_hold_reason: null,
  })

  it('refunds out of TryKai share and keeps the host payout', () => {
    expect(plan(released, 1000)).toMatchObject({
      ok: true,
      newHostPayoutCents: 4000,
      platformKeepsCents: 0,
      payoutReleased: true,
    })
    expect(plan(released, 1000, 4000)).toMatchObject({ ok: true })
  })

  it('refuses a refund TryKai cannot absorb, with a clear message', () => {
    const result = plan(released, 1500)
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(!result.ok && result.error).toBe(
      'Payout of $40 was already released. TryKai can absorb at most $10 from this booking, not $15. Recover the rest from the host first (OPERATIONS.md, Guest dispute refund).',
    )
  })

  it('never reports a negative absorbable amount', () => {
    const result = plan({ ...released, refund_amount: 1000 }, 100)
    expect(!result.ok && result.error).toMatch(/at most \$0 from/)
  })

  it('refuses to change a released payout', () => {
    const result = plan(released, 500, 3000)
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(!result.ok && result.error).toMatch(/cannot change it/)
  })
})

describe('planPartialRefund refusals', () => {
  it('needs a confirmed, not fully refunded booking with a PaymentIntent', () => {
    expect(plan(booking({ status: 'cancelled' }), 100, 0)).toMatchObject({ status: 409 })
    expect(plan(booking({ stripe_refund_id: 're_1' }), 100, 0)).toMatchObject({ status: 409 })
    expect(plan(booking({ stripe_payment_id: null }), 100, 0)).toMatchObject({ status: 409 })
  })
})

describe('partialRefundPatch', () => {
  it('writes the cumulative refund, the new payout, and clears the hold', () => {
    const b = booking({ stripe_partial_refund_ids: ['re_old'] })
    const p = plan(b, 1500, 2800) as PartialRefundPlan
    expect(partialRefundPatch(b, p, 're_new')).toEqual({
      refund_amount: 1500,
      host_payout_amount: 2800,
      stripe_partial_refund_ids: ['re_old', 're_new'],
      payout_hold_reason: null,
      payout_held_at: null,
    })
  })

  it('leaves a released payout and a replayed refund id alone', () => {
    const b = booking({
      payout_released_at: '2026-10-01T00:00:00Z',
      payout_hold_reason: null,
      stripe_partial_refund_ids: null,
    })
    const p = plan(b, 500) as PartialRefundPlan
    const patch = partialRefundPatch(b, p, 're_1')
    expect(patch).not.toHaveProperty('host_payout_amount')
    expect(patch.stripe_partial_refund_ids).toEqual(['re_1'])
    expect(
      partialRefundPatch({ ...b, stripe_partial_refund_ids: ['re_1'] }, p, 're_1')
        .stripe_partial_refund_ids,
    ).toEqual(['re_1'])
  })
})
