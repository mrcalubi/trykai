import { describe, expect, it } from 'vitest'
import {
  accountLinkParams,
  connectAccountCreateParams,
  payoutsEnabledFromAccount,
  siteUrlForAccountLinks,
} from './connect.ts'

describe('connectAccountCreateParams', () => {
  it('opens an Express account in Singapore that can receive transfers', () => {
    expect(connectAccountCreateParams({ id: 'user-1', email: 'host@trykai.sg' })).toEqual({
      country: 'SG',
      email: 'host@trykai.sg',
      controller: {
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        requirement_collection: 'stripe',
        stripe_dashboard: { type: 'express' },
      },
      capabilities: { transfers: { requested: true } },
      business_profile: {
        mcc: '8299',
        product_description: 'In-person skill and experience sessions',
      },
      metadata: { user_id: 'user-1' },
    })
  })

  it('omits email when the profile has none', () => {
    const params = connectAccountCreateParams({ id: 'user-2', email: null })
    expect(params.email).toBeUndefined()
    expect(params.metadata.user_id).toBe('user-2')
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
