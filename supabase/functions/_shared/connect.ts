export function connectAccountCreateParams(user: {
  id: string
  email?: string | null
}): {
  country: 'SG'
  email?: string
  controller: {
    fees: { payer: 'application' }
    losses: { payments: 'application' }
    requirement_collection: 'stripe'
    stripe_dashboard: { type: 'express' }
  }
  capabilities: { transfers: { requested: true } }
  business_profile: { mcc: string; product_description: string }
  metadata: { user_id: string }
} {
  const params: {
    country: 'SG'
    email?: string
    controller: {
      fees: { payer: 'application' }
      losses: { payments: 'application' }
      requirement_collection: 'stripe'
      stripe_dashboard: { type: 'express' }
    }
    capabilities: { transfers: { requested: true } }
    business_profile: { mcc: string; product_description: string }
    metadata: { user_id: string }
  } = {
    country: 'SG',
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
    metadata: { user_id: user.id },
  }
  if (user.email) params.email = user.email
  return params
}

export function siteUrlForAccountLinks(raw: string | undefined): string {
  const value = (raw ?? '').trim() || 'https://trykai.sg'
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(
      `SITE_URL must be a full URL starting with https:// (got "${value}"). Set it in Edge Function secrets.`,
    )
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `SITE_URL must be a full URL starting with https:// (got "${value}"). Set it in Edge Function secrets.`,
    )
  }
  return value.replace(/\/$/, '')
}

export function accountLinkParams(
  accountId: string,
  siteUrl: string,
): {
  account: string
  type: 'account_onboarding'
  refresh_url: string
  return_url: string
} {
  const base = siteUrlForAccountLinks(siteUrl)
  return {
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${base}/dashboard?connect=refresh`,
    return_url: `${base}/dashboard?connect=return`,
  }
}

export function payoutsEnabledFromAccount(account: {
  payouts_enabled?: boolean | null
}): boolean {
  return Boolean(account?.payouts_enabled)
}
