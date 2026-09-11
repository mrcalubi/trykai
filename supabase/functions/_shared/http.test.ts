import { describe, expect, it } from 'vitest'
import {
  asRecord,
  chargeIdFromPaymentIntent,
  corsHeaders,
  hasValidSecret,
  jsonResponse,
  stripeEventAction,
  textResponse,
} from './http.ts'

describe('stripeEventAction', () => {
  it('routes the events the webhook actually handles', () => {
    expect(stripeEventAction('payment_intent.succeeded')).toBe('confirm')
    expect(stripeEventAction('payment_intent.payment_failed')).toBe('cancel_pending')
    expect(stripeEventAction('payment_intent.canceled')).toBe('cancel_pending')
    expect(stripeEventAction('account.updated')).toBe('sync_account')
    expect(stripeEventAction('identity.verification_session.verified')).toBe('review_identity')
    expect(stripeEventAction('identity.verification_session.requires_input')).toBe('review_identity')
    expect(stripeEventAction('charge.refunded')).toBe('ignore')
    expect(stripeEventAction('identity.verification_session.created')).toBe('ignore')
    expect(stripeEventAction('ping')).toBe('ignore')
  })
})

describe('chargeIdFromPaymentIntent', () => {
  it('reads a string charge id', () => {
    expect(chargeIdFromPaymentIntent({ latest_charge: 'ch_123' })).toBe('ch_123')
  })

  it('reads an expanded charge object', () => {
    expect(chargeIdFromPaymentIntent({ latest_charge: { id: 'ch_expanded' } })).toBe('ch_expanded')
  })

  it('returns null when Stripe has not attached a charge yet', () => {
    expect(chargeIdFromPaymentIntent({})).toBeNull()
    expect(chargeIdFromPaymentIntent({ latest_charge: null })).toBeNull()
    expect(chargeIdFromPaymentIntent({ latest_charge: '' })).toBeNull()
  })
})

describe('jsonResponse', () => {
  it('serialises JSON with CORS headers', async () => {
    const response = jsonResponse({ ok: true }, 201)
    expect(response.status).toBe(201)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
    expect(await response.json()).toEqual({ ok: true })
  })

  it('defaults to HTTP 200', () => {
    expect(jsonResponse({}).status).toBe(200)
  })
})

describe('textResponse', () => {
  it('returns plain text with CORS headers', async () => {
    const response = textResponse('No payouts due')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('No payouts due')
  })
})

describe('asRecord', () => {
  it('unwraps a one-element embed array and passes objects through', () => {
    expect(asRecord({ host_id: 'h1' })).toEqual({ host_id: 'h1' })
    expect(asRecord([{ host_id: 'h1' }])).toEqual({ host_id: 'h1' })
    expect(asRecord([])).toBeNull()
    expect(asRecord(null)).toBeNull()
    expect(asRecord(undefined)).toBeNull()
  })
})

describe('hasValidSecret', () => {
  it('accepts the named header or a bearer token', () => {
    const secret = 's3cret'
    expect(hasValidSecret(new Request('http://n', { headers: { 'x-cron-secret': secret } }), secret)).toBe(
      true,
    )
    expect(
      hasValidSecret(new Request('http://n', { headers: { authorization: `Bearer ${secret}` } }), secret),
    ).toBe(true)
  })

  it('rejects a missing or wrong secret', () => {
    expect(hasValidSecret(new Request('http://n'), 's3cret')).toBe(false)
    expect(hasValidSecret(new Request('http://n', { headers: { 'x-cron-secret': 'nope' } }), 's3cret')).toBe(
      false,
    )
    expect(hasValidSecret(new Request('http://n', { headers: { 'x-cron-secret': 's3cret' } }), '')).toBe(
      false,
    )
    expect(hasValidSecret(new Request('http://n', { headers: { 'x-cron-secret': 's3cret' } }), undefined)).toBe(
      false,
    )
  })

  it('accepts a caller-specified header name', () => {
    const secret = 'admin-secret'
    expect(
      hasValidSecret(new Request('http://n', { headers: { 'x-admin-secret': secret } }), secret, [
        'x-admin-secret',
      ]),
    ).toBe(true)
    expect(
      hasValidSecret(new Request('http://n', { headers: { 'x-cron-secret': secret } }), secret, [
        'x-admin-secret',
      ]),
    ).toBe(false)
  })
})
