export const STRIPE_ACCOUNTS_V2_VERSION = '2026-08-26.preview'
export const STRIPE_ACCOUNTS_V2_URL = 'https://api.stripe.com/v2/core/accounts'

export type ConnectAccountUser = {
  id: string
  email?: string | null
  full_name?: string | null
}

export function connectAccountCreateParams(user: ConnectAccountUser): {
  dashboard: 'express'
  identity: { country: 'sg' }
  defaults: {
    currency: 'sgd'
    responsibilities: { fees_collector: 'application'; losses_collector: 'application' }
  }
  configuration: {
    recipient: {
      capabilities: { stripe_balance: { stripe_transfers: { requested: true } } }
    }
  }
  metadata: { user_id: string }
  include: string[]
  contact_email?: string
  display_name?: string
} {
  const params: {
    dashboard: 'express'
    identity: { country: 'sg' }
    defaults: {
      currency: 'sgd'
      responsibilities: { fees_collector: 'application'; losses_collector: 'application' }
    }
    configuration: {
      recipient: {
        capabilities: { stripe_balance: { stripe_transfers: { requested: true } } }
      }
    }
    metadata: { user_id: string }
    include: string[]
    contact_email?: string
    display_name?: string
  } = {
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
    metadata: { user_id: user.id },
    include: ['configuration.recipient', 'identity', 'requirements'],
  }
  const email = user.email?.trim()
  if (email) params.contact_email = email
  const displayName = user.full_name?.trim() || email
  if (displayName) params.display_name = displayName
  return params
}

export function stripeV2ErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const rec = payload as { error?: { message?: unknown }; message?: unknown }
    if (typeof rec.error?.message === 'string' && rec.error.message.trim()) {
      return rec.error.message.trim()
    }
    if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim()
  }
  return `Stripe account create failed (${status})`
}

export async function createConnectedAccount(
  secretKey: string,
  user: ConnectAccountUser,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string }> {
  if (!secretKey.trim()) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  const body = connectAccountCreateParams(user)
  if (!body.contact_email) {
    throw new Error('Your profile needs an email before Stripe payouts can be set up.')
  }

  const response = await fetchImpl(STRIPE_ACCOUNTS_V2_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Stripe-Version': STRIPE_ACCOUNTS_V2_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(stripeV2ErrorMessage(payload, response.status))
  }

  const id =
    payload && typeof payload === 'object' && typeof (payload as { id?: unknown }).id === 'string'
      ? (payload as { id: string }).id
      : ''
  if (!id) {
    throw new Error('Stripe did not return a connected account id')
  }
  return { id }
}

/**
 * SITE_URL comes from Edge Function secrets, where a bare domain or a stray
 * trailing slash is an easy mistake. Fail with a message that names the fix
 * rather than letting Stripe reject the URL later.
 */
export function normalizeSiteUrl(raw: string | undefined): string {
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

/** @deprecated Prefer `normalizeSiteUrl`; kept because Connect call sites read better with it. */
export const siteUrlForAccountLinks = normalizeSiteUrl

export function accountLinkParams(
  accountId: string,
  siteUrl: string,
): {
  account: string
  type: 'account_onboarding'
  refresh_url: string
  return_url: string
} {
  const base = normalizeSiteUrl(siteUrl)
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
