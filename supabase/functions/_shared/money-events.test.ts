import { describe, expect, it, vi } from 'vitest'
import type { AdminActor } from './admin-auth.ts'
import {
  MAX_NOTE_LENGTH,
  adminCancelEvent,
  cleanNote,
  holdEvent,
  moneyEventRow,
  partialRefundEvent,
  recordMoneyEvent,
  releaseHoldEvent,
  type MoneyEventRow,
} from './money-events.ts'

const admin: AdminActor = { method: 'admin_jwt', userId: 'admin-id', operator: null }
const glass: AdminActor = { method: 'break_glass', userId: null, operator: 'Caleb' }
const booking = { id: 'booking-1', host_payout_amount: 4000 }

describe('cleanNote', () => {
  it('trims, allows empty when optional, and bounds the length', () => {
    expect(cleanNote('  late  ')).toEqual({ ok: true, note: 'late' })
    expect(cleanNote(undefined)).toEqual({ ok: true, note: null })
    expect(cleanNote('   ')).toEqual({ ok: true, note: null })
    expect(cleanNote('', { required: true })).toEqual({ ok: false, status: 400, error: 'note is required' })
    expect(cleanNote(5)).toMatchObject({ ok: false, status: 400, error: 'note must be text' })
    expect(cleanNote('x'.repeat(MAX_NOTE_LENGTH))).toMatchObject({ ok: true })
    expect(cleanNote('x'.repeat(MAX_NOTE_LENGTH + 1))).toMatchObject({ ok: false, status: 400 })
  })
})

describe('moneyEventRow', () => {
  it('records the admin user id for a JWT caller', () => {
    expect(moneyEventRow({ bookingId: 'b', action: 'hold', actor: admin, note: 'x' })).toEqual({
      booking_id: 'b',
      action: 'hold',
      actor_user_id: 'admin-id',
      auth_method: 'admin_jwt',
      amount_cents: null,
      host_payout_before: null,
      host_payout_after: null,
      stripe_object_id: null,
      note: 'x',
    })
  })

  it('names the operator in the note when there is no user id', () => {
    expect(moneyEventRow({ bookingId: 'b', action: 'hold', actor: glass, note: 'x' })).toMatchObject({
      actor_user_id: null,
      auth_method: 'break_glass',
      note: '[break-glass: Caleb] x',
    })
    expect(
      moneyEventRow({
        bookingId: 'b',
        action: 'hold',
        actor: { method: 'system', userId: null, operator: 'stripe-webhook' },
      }),
    ).toMatchObject({ auth_method: 'system', note: '[system: stripe-webhook]' })
  })

  it('never stores a note longer than the table allows', () => {
    const row = moneyEventRow({ bookingId: 'b', action: 'hold', actor: glass, note: 'x'.repeat(5000) })
    expect(row.note).toHaveLength(2000)
  })
})

describe('event builders', () => {
  it('hold keeps the code in the note and the payout unchanged', () => {
    expect(holdEvent(booking, admin, { code: 'dispute', note: 'host late' })).toMatchObject({
      action: 'hold',
      host_payout_before: 4000,
      host_payout_after: 4000,
      amount_cents: null,
      note: 'dispute: host late',
    })
  })

  it('release_hold records which hold was released', () => {
    expect(
      releaseHoldEvent({ ...booking, payout_hold_reason: 'chargeback' }, admin, 'won the dispute'),
    ).toMatchObject({ action: 'release_hold', note: 'chargeback: won the dispute' })
    expect(releaseHoldEvent({ ...booking, payout_hold_reason: 'dispute' }, admin, null).note).toBe('dispute')
  })

  it('partial_refund records amount, payout change, and the Stripe refund', () => {
    expect(
      partialRefundEvent(booking, admin, {
        refundCents: 1500,
        newHostPayoutCents: 2800,
        stripeRefundId: 're_1',
        note: null,
      }),
    ).toMatchObject({
      action: 'partial_refund',
      amount_cents: 1500,
      host_payout_before: 4000,
      host_payout_after: 2800,
      stripe_object_id: 're_1',
      note: null,
    })
  })

  it('admin_cancel zeroes the payout unless it was already released', () => {
    const cancel = { reason: 'dispute', refundedNowCents: 5000, stripeRefundId: 're_2', note: 'upheld' }
    expect(adminCancelEvent({ ...booking, payout_released_at: null }, admin, cancel)).toMatchObject({
      action: 'admin_cancel',
      amount_cents: 5000,
      host_payout_before: 4000,
      host_payout_after: 0,
      stripe_object_id: 're_2',
      note: 'dispute: upheld',
    })
    expect(
      adminCancelEvent({ ...booking, payout_released_at: '2026-10-01T00:00:00Z' }, admin, {
        ...cancel,
        note: null,
      }),
    ).toMatchObject({ host_payout_after: 4000, note: 'dispute' })
  })
})

describe('recordMoneyEvent', () => {
  const row = holdEvent(booking, admin, { code: 'dispute', note: 'n' })

  it('reports success', async () => {
    const insert = vi.fn(async (_row: MoneyEventRow) => ({ error: null }))
    await expect(recordMoneyEvent(insert, row)).resolves.toEqual({ audit_logged: true })
    expect(insert).toHaveBeenCalledWith(row)
  })

  it('logs and reports an insert error or a throw instead of failing the action', async () => {
    const log = vi.fn()
    const failed = await recordMoneyEvent(async () => ({ error: { message: 'denied' } }), row, log)
    expect(failed).toMatchObject({ audit_logged: false })
    expect(!failed.audit_logged && failed.audit_error).toMatch(/denied/)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('record this by hand'), JSON.stringify(row), 'denied')

    const thrown = await recordMoneyEvent(
      async () => {
        throw new Error('network')
      },
      row,
      log,
    )
    expect(!thrown.audit_logged && thrown.audit_error).toMatch(/network/)
  })
})
