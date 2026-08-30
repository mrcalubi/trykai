import { describe, expect, it, vi } from 'vitest'
import {
  accountLinkParams,
  connectAccountCreateParams,
  createConnectedAccount,
  payoutsEnabledFromAccount,
  siteUrlForAccountLinks,
  STRIPE_ACCOUNTS_V2_URL,
  STRIPE_ACCOUNTS_V2_VERSION,
  stripeV2ErrorMessage,
} from './connect.ts'

describe('connectAccountCreateParams', () => {
  it('opens an Express recipient account in Singapore that can receive transfers', () => {
    expect(connectAccountCreateParams({ id: 'user-1', email: 'host@trykai.sg' })).toEqual({
      dashboard: 'express',
      identity: { country: 'sg' },
      defaults: {
        currency: 'sgd',
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      metadata: { user_id: 'user-1' },
      include: ['configuration.recipient', 'identity', 'requirements'],
      contact_email: 'host@trykai.sg',
      display_name: 'host@trykai.sg',
    })
  })

  it('prefers the host name as the Stripe display name', () => {
    const params = connectAccountCreateParams({
      id: 'user-1',
      email: 'host@trykai.sg',
      full_name: 'Caleb Ong',
    })
    expect(params.display_name).toBe('Caleb Ong')
    expect(params.contact_email).toBe('host@trykai.sg')
  })

  it('omits email when the profile has none', () => {
    const params = connectAccountCreateParams({ id: 'user-2', email: null })
    expect(params.contact_email).toBeUndefined()
    expect(params.metadata.user_id).toBe('user-2')
  })
})

describe('createConnectedAccount', () => {
  it('creates the account through Accounts v2', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'acct_v2' }),
    })

    await expect(
      createConnectedAccount('sk_test_123', { id: 'user-1', email: 'host@trykai.sg' }, fetchImpl),
    ).resolves.toEqual({ id: 'acct_v2' })

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(STRIPE_ACCOUNTS_V2_URL)
    expect(init.method).toBe('POST')
    expect(init.headers['Stripe-Version']).toBe(STRIPE_ACCOUNTS_V2_VERSION)
    expect(JSON.parse(init.body)).toMatchObject({
      dashboard: 'express',
      identity: { country: 'sg' },
      contact_email: 'host@trykai.sg',
    })
  })

  it('surfaces Stripe’s v2 error message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Stripe no longer recommends Accounts v1 for new Connect integrations.' },
      }),
    })

    await expect(
      createConnectedAccount('sk_test_123', { id: 'user-1', email: 'host@trykai.sg' }, fetchImpl),
    ).rejects.toThrow('Stripe no longer recommends Accounts v1 for new Connect integrations.')
  })

  it('refuses to create an account without an email', async () => {
    const fetchImpl = vi.fn()
    await expect(createConnectedAccount('sk_test_123', { id: 'user-1' }, fetchImpl)).rejects.toThrow(
      /profile needs an email/,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('stripeV2ErrorMessage', () => {
  it('reads error.message from a v2 error payload', () => {
    expect(stripeV2ErrorMessage({ error: { message: 'blocked' } }, 400)).toBe('blocked')
    expect(stripeV2ErrorMessage({}, 503)).toBe('Stripe account create failed (503)')
  })
})

describe('accountLinkParams', () => {
  it('sends the host back to the dashboard after Stripe onboarding', () => {
    expect(accountLinkParams('acct_1', 'https://trykai.sg/')).toEqual({
      account: 'acct_1',
      type: 'account_onboarding',
      refresh_url: 'https://trykai.sg/dashboard?connect=refresh',
      return_url: 'https://trykai.sg/dashboard?connect=return',
    })
  })
})

describe('siteUrlForAccountLinks', () => {
  it('defaults to trykai.sg when unset', () => {
    expect(siteUrlForAccountLinks(undefined)).toBe('https://trykai.sg')
    expect(siteUrlForAccountLinks('')).toBe('https://trykai.sg')
  })

  it('rejects a value that is not a URL', () => {
    expect(() => siteUrlForAccountLinks('trykai.sg')).toThrow(/SITE_URL must be a full URL/)
  })
})

describe('payoutsEnabledFromAccount', () => {
  it('is true only when Stripe says payouts are enabled', () => {
    expect(payoutsEnabledFromAccount({ payouts_enabled: true })).toBe(true)
    expect(payoutsEnabledFromAccount({ payouts_enabled: false })).toBe(false)
    expect(payoutsEnabledFromAccount({})).toBe(false)
  })
})
