import { describe, expect, it, vi } from 'vitest'
import {
  PAYOUT_HOLD_MS,
  countSkipReasons,
  isPayoutDue,
  payoutSkipReason,
  resolveChargeId,
  summarisePayoutRun,
  transferCreateParams,
} from './payouts.ts'

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    status: 'confirmed',
    payout_released_at: null,
    stripe_refund_id: null,
    host_payout_amount: 2500,
    stripe_charge_id: 'ch_1',
    stripe_payment_id: 'pi_1',
    starts_at: new Date(Date.now() - PAYOUT_HOLD_MS - 1000).toISOString(),
    stripe_account_id: 'acct_1',
    stripe_payouts_enabled: true,
    ...overrides,
  }
}

describe('payoutSkipReason', () => {
  it('returns null when a confirmed booking is ready to Transfer', () => {
    expect(payoutSkipReason(candidate())).toBeNull()
    expect(isPayoutDue(candidate())).toBe(true)
  })

  it('holds funds until 24 hours after starts_at, not after payment', () => {
    expect(payoutSkipReason(candidate({ starts_at: new Date().toISOString() }))).toBe(
      'hold_not_elapsed',
    )
    expect(
      payoutSkipReason(
        candidate({ starts_at: new Date(Date.now() - PAYOUT_HOLD_MS + 60_000).toISOString() }),
      ),
    ).toBe('hold_not_elapsed')
  })

  it('names the reason a booking is not ready to pay', () => {
    expect(payoutSkipReason(candidate({ status: 'pending' }))).toBe('not_confirmed')
    expect(payoutSkipReason(candidate({ payout_released_at: new Date().toISOString() }))).toBe(
      'already_released',
    )
    expect(payoutSkipReason(candidate({ stripe_refund_id: 're_1' }))).toBe('refunded')
    expect(payoutSkipReason(candidate({ host_payout_amount: 0 }))).toBe('no_host_share')
    expect(payoutSkipReason(candidate({ stripe_charge_id: null }))).toBe('missing_charge_id')
    expect(payoutSkipReason(candidate({ stripe_account_id: null }))).toBe('host_not_connected')
    expect(payoutSkipReason(candidate({ stripe_payouts_enabled: false }))).toBe(
      'host_payouts_disabled',
    )
    expect(payoutSkipReason(candidate({ starts_at: 'not-a-date' }))).toBe('invalid_starts_at')
  })
})

describe('resolveChargeId', () => {
  it('keeps a charge already stored on the booking', async () => {
    const retrieve = vi.fn()
    await expect(resolveChargeId(candidate(), retrieve)).resolves.toBe('ch_1')
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('loads latest_charge from the PaymentIntent when the charge column is empty', async () => {
    const retrieve = vi.fn().mockResolvedValue({ latest_charge: 'ch_from_pi' })
    await expect(
      resolveChargeId(candidate({ stripe_charge_id: null, stripe_payment_id: 'pi_paynow' }), retrieve),
    ).resolves.toBe('ch_from_pi')
    expect(retrieve).toHaveBeenCalledWith('pi_paynow')
  })

  it('reads an expanded charge object', async () => {
    const retrieve = vi.fn().mockResolvedValue({ latest_charge: { id: 'ch_expanded' } })
    await expect(
      resolveChargeId(candidate({ stripe_charge_id: null }), retrieve),
    ).resolves.toBe('ch_expanded')
  })

  it('returns null when the PaymentIntent has no charge yet', async () => {
    const retrieve = vi.fn().mockResolvedValue({ latest_charge: null })
    await expect(
      resolveChargeId(candidate({ stripe_charge_id: null }), retrieve),
    ).resolves.toBeNull()
  })

  it('returns null when there is no PaymentIntent to look up', async () => {
    const retrieve = vi.fn()
    await expect(
      resolveChargeId(candidate({ stripe_charge_id: null, stripe_payment_id: null }), retrieve),
    ).resolves.toBeNull()
    expect(retrieve).not.toHaveBeenCalled()
  })
})

describe('summarisePayoutRun', () => {
  it('counts skip reasons and hides the expected 24h hold from the detail list', () => {
    expect(
      summarisePayoutRun({
        scanned: 4,
        dueIds: ['booking-due'],
        released: ['booking-due'],
        failed: [],
        skipped: [
          { id: 'booking-soon', reason: 'hold_not_elapsed' },
          { id: 'booking-paynow', reason: 'missing_charge_id' },
          { id: 'booking-offboarded', reason: 'host_payouts_disabled' },
        ],
      }),
    ).toEqual({
      scanned: 4,
      due: 1,
      released: ['booking-due'],
      failed: [],
      skipped_by_reason: {
        hold_not_elapsed: 1,
        missing_charge_id: 1,
        host_payouts_disabled: 1,
      },
      skipped: [
        { id: 'booking-paynow', reason: 'missing_charge_id' },
        { id: 'booking-offboarded', reason: 'host_payouts_disabled' },
      ],
    })
  })

  it('aggregates duplicate skip reasons', () => {
    expect(
      countSkipReasons([
        { reason: 'hold_not_elapsed' },
        { reason: 'hold_not_elapsed' },
        { reason: 'host_not_connected' },
      ]),
    ).toEqual({ hold_not_elapsed: 2, host_not_connected: 1 })
  })
})

describe('transferCreateParams', () => {
  it('ties the transfer to the original charge and booking', () => {
    expect(transferCreateParams(candidate())).toEqual({
      amount: 2500,
      currency: 'sgd',
      destination: 'acct_1',
      transfer_group: 'booking-1',
      source_transaction: 'ch_1',
      metadata: { booking_id: 'booking-1' },
    })
  })
})
