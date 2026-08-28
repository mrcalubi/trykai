import { describe, expect, it } from 'vitest'
import { isPayoutDue, transferCreateParams } from './payouts.ts'

const HOLD_MS = 24 * 60 * 60 * 1000

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    status: 'confirmed',
    payout_released_at: null,
    stripe_refund_id: null,
    host_payout_amount: 2500,
    stripe_charge_id: 'ch_1',
    starts_at: new Date(Date.now() - HOLD_MS - 1000).toISOString(),
    stripe_account_id: 'acct_1',
    stripe_payouts_enabled: true,
    ...overrides,
  }
}

describe('isPayoutDue', () => {
  it('releases a confirmed booking 24 hours after the session starts', () => {
    expect(isPayoutDue(candidate())).toBe(true)
  })

  it('holds funds until 24 hours after starts_at, not after payment', () => {
    expect(isPayoutDue(candidate({ starts_at: new Date().toISOString() }))).toBe(false)
    expect(
      isPayoutDue(candidate({ starts_at: new Date(Date.now() - HOLD_MS + 60_000).toISOString() })),
    ).toBe(false)
  })

  it('skips bookings that are not ready to pay', () => {
    expect(isPayoutDue(candidate({ status: 'pending' }))).toBe(false)
    expect(isPayoutDue(candidate({ payout_released_at: new Date().toISOString() }))).toBe(false)
    expect(isPayoutDue(candidate({ stripe_refund_id: 're_1' }))).toBe(false)
    expect(isPayoutDue(candidate({ host_payout_amount: 0 }))).toBe(false)
    expect(isPayoutDue(candidate({ stripe_charge_id: null }))).toBe(false)
    expect(isPayoutDue(candidate({ stripe_account_id: null }))).toBe(false)
    expect(isPayoutDue(candidate({ stripe_payouts_enabled: false }))).toBe(false)
    expect(isPayoutDue(candidate({ starts_at: 'not-a-date' }))).toBe(false)
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
