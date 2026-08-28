export function connectAccountCreateParams(user: {
  id: string
  email?: string | null
}): {
  type: 'express'
  country: 'SG'
  email?: string
  capabilities: { transfers: { requested: true } }
  business_profile: { mcc: string; product_description: string }
  metadata: { user_id: string }
} {
  const params: {
    type: 'express'
    country: 'SG'
    email?: string
    capabilities: { transfers: { requested: true } }
    business_profile: { mcc: string; product_description: string }
    metadata: { user_id: string }
  } = {
    type: 'express',
    country: 'SG',
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

export function accountLinkParams(
  accountId: string,
  siteUrl: string,
): {
  account: string
  type: 'account_onboarding'
  refresh_url: string
  return_url: string
} {
  const base = siteUrl.replace(/\/$/, '')
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
