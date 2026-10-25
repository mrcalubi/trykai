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

function requirementItems(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

/**
 * True when Stripe is only verifying: nothing currently or past due.
 * `pending_verification` is still checking, not something the host must send.
 */
export function connectOnboardingPending(account: {
  requirements?: {
    currently_due?: unknown
    past_due?: unknown
    pending_verification?: unknown
  } | null
} | null | undefined): boolean {
  const requirements = account?.requirements
  if (requirementItems(requirements?.currently_due).length > 0) return false
  if (requirementItems(requirements?.past_due).length > 0) return false
  return true
}

export function isAccountLinkRefresh(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && (body as { refresh?: unknown }).refresh === true)
}

/** Prefer data.object.id (the Account). Fall back to event.account on a Connect destination. */
export function connectedAccountFromEvent(event: {
  account?: string | null
  data?: { object?: { id?: string | null; payouts_enabled?: boolean | null } | null }
}): { id: string; payouts_enabled?: boolean | null } | null {
  const object = event.data?.object
  const id =
    (typeof object?.id === 'string' && object.id) ||
    (typeof event.account === 'string' && event.account) ||
    ''
  if (!id) return null
  return { id, payouts_enabled: object?.payouts_enabled }
}

export type UsersPayoutsWriter = {
  from: (table: string) => {
    update: (payload: { stripe_payouts_enabled: boolean }) => {
      eq: (column: string, value: string) => PromiseLike<{ error?: { message?: string } | null }>
    }
  }
}

/** Writes stripe_payouts_enabled for the host whose stripe_account_id matches. Zero rows is fine. */
export async function applyConnectedAccountPayouts(
  admin: UsersPayoutsWriter,
  account: { id?: string | null; payouts_enabled?: boolean | null } | null,
): Promise<void> {
  const accountId = typeof account?.id === 'string' ? account.id : ''
  if (!account || !accountId) {
    console.error('connect: account could not be read; skipping stripe_payouts_enabled update')
    return
  }
  const { error } = await admin
    .from('users')
    .update({ stripe_payouts_enabled: payoutsEnabledFromAccount(account) })
    .eq('stripe_account_id', accountId)
  if (error) throw new Error(error.message)
}
