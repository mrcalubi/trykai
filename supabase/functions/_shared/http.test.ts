import { describe, expect, it, vi } from 'vitest'
import {
  asRecord,
  chargeIdFromPaymentIntent,
  constructStripeWebhookEvent,
  corsHeaders,
  hasValidSecret,
  jsonResponse,
  stripeEventAction,
  stripeWebhookSecrets,
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
    expect(stripeEventAction('charge.dispute.created')).toBe('chargeback_opened')
    expect(stripeEventAction('charge.dispute.closed')).toBe('chargeback_closed')
    expect(stripeEventAction('charge.refunded')).toBe('reconcile_refund')
    expect(stripeEventAction('charge.dispute.updated')).toBe('ignore')
    expect(stripeEventAction('charge.refund.updated')).toBe('ignore')
    expect(stripeEventAction('identity.verification_session.created')).toBe('ignore')
    expect(stripeEventAction('ping')).toBe('ignore')
  })
})

describe('constructStripeWebhookEvent', () => {
  const platform = 'whsec_platform'
  const connect = 'whsec_connect'
  const event = { id: 'evt_1', type: 'account.updated' }

  it('accepts a signature that matches STRIPE_WEBHOOK_SECRET', async () => {
    const constructEvent = vi.fn(async (_body, _signature, secret) => {
      if (secret !== platform) throw new Error('bad sig')
      return event
    })

    const verified = await constructStripeWebhookEvent({
      constructEvent,
      body: '{}',
      signature: 't=1,v1=abc',
      secrets: stripeWebhookSecrets({
        STRIPE_WEBHOOK_SECRET: platform,
        STRIPE_CONNECT_WEBHOOK_SECRET: connect,
      }),
    })

    expect(verified).toEqual({ ok: true, event })
    expect(constructEvent).toHaveBeenCalledWith('{}', 't=1,v1=abc', platform)
  })

  it('falls back to STRIPE_CONNECT_WEBHOOK_SECRET when the platform secret does not match', async () => {
    const constructEvent = vi.fn(async (_body, _signature, secret) => {
      if (secret !== connect) throw new Error('bad sig')
      return event
    })

    const verified = await constructStripeWebhookEvent({
      constructEvent,
      body: '{}',
      signature: 't=1,v1=connect',
      secrets: stripeWebhookSecrets({
        STRIPE_WEBHOOK_SECRET: platform,
        STRIPE_CONNECT_WEBHOOK_SECRET: connect,
      }),
    })

    expect(verified).toEqual({ ok: true, event })
    expect(constructEvent).toHaveBeenNthCalledWith(1, '{}', 't=1,v1=connect', platform)
    expect(constructEvent).toHaveBeenNthCalledWith(2, '{}', 't=1,v1=connect', connect)
  })

  it('rejects a signature that matches neither secret', async () => {
    const constructEvent = vi.fn(async () => {
      throw new Error('bad sig')
    })

    await expect(
      constructStripeWebhookEvent({
        constructEvent,
        body: '{}',
        signature: 't=1,v1=nope',
        secrets: stripeWebhookSecrets({
          STRIPE_WEBHOOK_SECRET: platform,
          STRIPE_CONNECT_WEBHOOK_SECRET: connect,
        }),
      }),
    ).resolves.toEqual({ ok: false, error: 'Invalid signature' })
  })

  it('rejects when no signature or no secrets are configured', async () => {
    const constructEvent = vi.fn()
    await expect(
      constructStripeWebhookEvent({
        constructEvent,
        body: '{}',
        signature: null,
        secrets: stripeWebhookSecrets({
          STRIPE_WEBHOOK_SECRET: platform,
        }),
      }),
    ).resolves.toEqual({ ok: false, error: 'Missing webhook signature' })
    await expect(
      constructStripeWebhookEvent({
        constructEvent,
        body: '{}',
        signature: 't=1,v1=abc',
        secrets: stripeWebhookSecrets({}),
      }),
    ).resolves.toEqual({ ok: false, error: 'Missing webhook signature' })
    expect(constructEvent).not.toHaveBeenCalled()
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

describe('corsHeaders', () => {
  it('allows the secret headers cron and database-webhook callers send', () => {
    const allowed = corsHeaders['Access-Control-Allow-Headers']
    expect(allowed).toContain('x-cron-secret')
    expect(allowed).toContain('x-admin-secret')
    expect(allowed).toContain('x-notify-secret')
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
