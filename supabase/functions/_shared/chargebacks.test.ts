import { describe, expect, it } from 'vitest'
import {
  chargebackClosedEmail,
  chargebackHoldReason,
  chargebackOpenedEmail,
  disputeClosedOutcome,
  formatDisputeReason,
  formatEvidenceDueBy,
  planChargebackHold,
  refundReconcilePatch,
  stripeDisputeUrl,
  stripeObjectId,
  type ChargebackBooking,
  type StripeDisputeLike,
} from './chargebacks.ts'

const NOW = '2026-10-19T08:00:00.000Z'

function booking(overrides: Partial<ChargebackBooking> = {}): ChargebackBooking {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000000',
    payout_released_at: null,
    payout_hold_reason: null,
    stripe_refund_id: null,
    refund_amount: null,
    stripe_partial_refund_ids: [],
    ...overrides,
  }
}

function dispute(overrides: Partial<StripeDisputeLike> = {}): StripeDisputeLike {
  return {
    id: 'dp_1',
    charge: 'ch_1',
    payment_intent: 'pi_1',
    amount: 2850,
    currency: 'sgd',
    reason: 'product_not_received',
    status: 'needs_response',
    // 2026-10-29T04:00:00Z → 29 Oct 2026, 12:00 pm in Singapore.
    evidence_details: { due_by: Date.parse('2026-10-29T04:00:00.000Z') / 1000 },
    ...overrides,
  }
}

describe('stripeObjectId', () => {
  it('reads an id or an expanded object, and nothing else', () => {
    expect(stripeObjectId('ch_1')).toBe('ch_1')
    expect(stripeObjectId({ id: 'ch_2' })).toBe('ch_2')
    expect(stripeObjectId('')).toBeNull()
    expect(stripeObjectId({ id: '' })).toBeNull()
    expect(stripeObjectId({})).toBeNull()
    expect(stripeObjectId(null)).toBeNull()
    expect(stripeObjectId(undefined)).toBeNull()
  })
})

describe('planChargebackHold', () => {
  it('holds an unreleased payout with a neutral chargeback reason', () => {
    expect(chargebackHoldReason('dp_1')).toBe('chargeback: dp_1')
    expect(planChargebackHold(booking(), 'dp_1', NOW)).toEqual({
      kind: 'hold',
      patch: { payout_hold_reason: 'chargeback: dp_1', payout_held_at: NOW },
    })
  })

  it('replaces an admin dispute hold reason', () => {
    expect(
      planChargebackHold(booking({ payout_hold_reason: 'dispute: quality complaint' }), 'dp_1', NOW),
    ).toMatchObject({ kind: 'hold', patch: { payout_hold_reason: 'chargeback: dp_1' } })
  })

  it('is a no-op on redelivery of the same dispute', () => {
    expect(
      planChargebackHold(booking({ payout_hold_reason: 'chargeback: dp_1' }), 'dp_1', NOW),
    ).toEqual({ kind: 'already_held' })
  })

  it('reports a payout that already went out instead of holding', () => {
    expect(
      planChargebackHold(booking({ payout_released_at: '2026-10-18T00:00:00Z' }), 'dp_1', NOW),
    ).toEqual({ kind: 'payout_released' })
  })
})

describe('refundReconcilePatch', () => {
  it('records a Dashboard refund the booking does not know about', () => {
    expect(
      refundReconcilePatch(booking(), { amount_refunded: 1000 }, [{ id: 're_dash', status: 'succeeded' }]),
    ).toEqual({ refund_amount: 1000, stripe_partial_refund_ids: ['re_dash'] })
  })

  it('appends to existing partial refunds and never lowers refund_amount', () => {
    expect(
      refundReconcilePatch(
        booking({ refund_amount: 1500, stripe_partial_refund_ids: ['re_a'] }),
        { amount_refunded: 1200 },
        [
          { id: 're_a', status: 'succeeded' },
          { id: 're_b', status: 'pending' },
        ],
      ),
    ).toEqual({ stripe_partial_refund_ids: ['re_a', 're_b'] })
  })

  it('raises refund_amount without new ids', () => {
    expect(
      refundReconcilePatch(booking({ refund_amount: 500 }), { amount_refunded: 800 }, []),
    ).toEqual({ refund_amount: 800 })
  })

  it('skips refunds already in stripe_refund_id or stripe_partial_refund_ids', () => {
    expect(
      refundReconcilePatch(
        booking({ refund_amount: 3000, stripe_refund_id: 're_full', stripe_partial_refund_ids: ['re_a'] }),
        { amount_refunded: 3000 },
        [{ id: 're_full' }, { id: 're_a' }],
      ),
    ).toBeNull()
  })

  it('skips failed, canceled, and TryKai-recorded refunds, and duplicates', () => {
    expect(
      refundReconcilePatch(
        booking({ refund_amount: 2000, stripe_partial_refund_ids: null }),
        { amount_refunded: 2000 },
        [
          { id: 're_failed', status: 'failed' },
          { id: 're_canceled', status: 'canceled' },
          { id: 're_admin', status: 'succeeded', metadata: { booking_id: 'b1', kind: 'dispute_partial' } },
          { id: 're_x', status: 'succeeded', metadata: {} },
          { id: 're_x', status: 'succeeded', metadata: null },
        ],
      ),
    ).toEqual({ stripe_partial_refund_ids: ['re_x'] })
  })

  it('returns null when nothing is refunded', () => {
    expect(refundReconcilePatch(booking(), {}, [])).toBeNull()
    expect(refundReconcilePatch(booking(), { amount_refunded: null }, [])).toBeNull()
  })
})

describe('formatting', () => {
  it('formats the dispute reason', () => {
    expect(formatDisputeReason('product_not_received')).toBe('product not received')
    expect(formatDisputeReason('fraudulent')).toBe('fraudulent')
    expect(formatDisputeReason(null)).toBe('not given')
    expect(formatDisputeReason(undefined)).toBe('not given')
  })

  it('formats evidence_due_by in Singapore time', () => {
    expect(formatEvidenceDueBy(Date.parse('2026-10-29T04:00:00.000Z') / 1000)).toBe(
      `${new Date('2026-10-29T04:00:00.000Z').toLocaleString('en-SG', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Singapore',
      })} SGT`,
    )
    expect(formatEvidenceDueBy(null)).toBe('not given')
    expect(formatEvidenceDueBy(undefined)).toBe('not given')
    expect(formatEvidenceDueBy(0)).toBe('not given')
    expect(formatEvidenceDueBy(Number.NaN)).toBe('not given')
  })

  it('links the right Stripe mode', () => {
    expect(stripeDisputeUrl('dp_1', true)).toBe('https://dashboard.stripe.com/disputes/dp_1')
    expect(stripeDisputeUrl('dp_1', false)).toBe('https://dashboard.stripe.com/test/disputes/dp_1')
  })

  it('describes each closed outcome', () => {
    expect(disputeClosedOutcome('won')).toMatch(/TryKai won/)
    expect(disputeClosedOutcome('lost')).toMatch(/dispute fee stay debited/)
    expect(disputeClosedOutcome('warning_closed')).toMatch(/inquiry closed/)
    expect(disputeClosedOutcome('charge_refunded')).toBe('Closed with status "charge_refunded".')
    expect(disputeClosedOutcome(null)).toBe('Closed with status "unknown".')
  })
})

describe('chargebackOpenedEmail', () => {
  it('gives ops the reference, amount, reason, and evidence deadline', () => {
    const email = chargebackOpenedEmail({
      dispute: dispute(),
      bookingId: booking().id,
      outcome: 'held',
      livemode: false,
    })
    expect(email.subject).toBe('Chargeback opened: A1B2C3D4, $28.50 SGD')
    expect(email.html).toContain('A1B2C3D4')
    expect(email.html).toContain(booking().id)
    expect(email.html).toContain('$28.50 SGD')
    expect(email.html).toContain('product not received')
    expect(email.html).toContain(formatEvidenceDueBy(dispute().evidence_details?.due_by))
    expect(email.html).toContain('needs_response')
    expect(email.html).toContain('now held')
    expect(email.html).toContain('https://dashboard.stripe.com/test/disputes/dp_1')
    expect(email.html).not.toContain('replaced the earlier hold')
  })

  it('names a hold reason it replaced, escaped', () => {
    const email = chargebackOpenedEmail({
      dispute: dispute(),
      bookingId: booking().id,
      outcome: 'held',
      previousHoldReason: 'dispute: <late>',
      livemode: true,
    })
    expect(email.html).toContain('replaced the earlier hold reason "dispute: &lt;late&gt;"')
    expect(email.html).toContain('https://dashboard.stripe.com/disputes/dp_1')
  })

  it('covers the other hold outcomes and missing fields', () => {
    expect(
      chargebackOpenedEmail({
        dispute: dispute(),
        bookingId: booking().id,
        outcome: 'already_held',
        previousHoldReason: 'chargeback: dp_1',
        livemode: true,
      }).html,
    ).toContain('already held for this chargeback')
    expect(
      chargebackOpenedEmail({
        dispute: dispute(),
        bookingId: booking().id,
        outcome: 'payout_released',
        livemode: true,
      }).html,
    ).toContain('already paid')

    const orphan = chargebackOpenedEmail({
      dispute: dispute({
        reason: null,
        status: null,
        evidence_details: null,
        currency: undefined as unknown as string,
      }),
      bookingId: null,
      outcome: 'no_booking',
      livemode: true,
    })
    expect(orphan.subject).toBe('Chargeback opened: no booking found, $28.50')
    expect(orphan.html).toContain('No booking matched')
    expect(orphan.html).not.toContain('Booking id')
    expect(orphan.html).toContain('unknown')
    expect(orphan.html).toContain('not given')
  })
})

describe('chargebackClosedEmail', () => {
  it('reports the outcome and says the hold was left in place', () => {
    const email = chargebackClosedEmail({
      dispute: dispute({ status: 'lost' }),
      bookingId: booking().id,
      payoutHoldReason: 'chargeback: dp_1',
      livemode: false,
    })
    expect(email.subject).toBe('Chargeback lost: A1B2C3D4, $28.50 SGD')
    expect(email.html).toContain('TryKai lost')
    expect(email.html).toContain('("chargeback: dp_1") was not cleared')
    expect(email.html).toContain(booking().id)
    expect(email.html).toContain('https://dashboard.stripe.com/test/disputes/dp_1')
  })

  it('handles a booking without a hold, or no booking at all', () => {
    const won = chargebackClosedEmail({
      dispute: dispute({ status: 'won' }),
      bookingId: booking().id,
      payoutHoldReason: null,
      livemode: true,
    })
    expect(won.html).toContain('TryKai won')
    expect(won.html).toContain('has no payout hold')

    const orphan = chargebackClosedEmail({
      dispute: dispute({ status: null }),
      bookingId: null,
      payoutHoldReason: null,
      livemode: true,
    })
    expect(orphan.subject).toBe('Chargeback closed: no booking found, $28.50 SGD')
    expect(orphan.html).not.toContain('Booking id')
    expect(orphan.html).toContain('Closed with status &quot;unknown&quot;.')
  })
})
