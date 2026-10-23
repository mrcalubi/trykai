/**
 * Singpass Login for host verification (00035, DECISIONS.md 23 October).
 * Pure helpers only, so the test suite can exercise them without Deno or the
 * network. The OIDC exchange itself lives in singpass-start and
 * singpass-callback, using openid-client as Singpass's own demo app does.
 *
 * Scope is `openid name`: the ID token's `sub` (Singpass's UUID for the
 * person) and `sub_attributes.name`. No NRIC number is requested.
 */

import { TEACHING_PLAN_MAX, TEACHING_PLAN_MIN } from './verification.ts'

export const SINGPASS_SCOPE = 'openid name'

/** Singpass requires one for Login apps; becoming a host is onboarding. */
export const SINGPASS_AUTH_CONTEXT_TYPE = 'APP_ONBOARDING_DEFAULT'

/** Shown on the Singpass screen. Printable ASCII, at most 100 characters. */
export const SINGPASS_AUTH_CONTEXT_MESSAGE = 'Verify your identity to host on TryKai'

/** Singpass gives the user 10 minutes; leave room for a slow return. */
export const SINGPASS_SESSION_MAX_AGE_MINUTES = 30


export type SingpassConfig = {
  clientId: string
  issuer: string
  redirectUri: string
  signingKey: JsonWebKey & { kid: string; alg: string }
  encryptionKey: JsonWebKey & { kid: string; alg: string }
}

const REQUIRED_SECRETS = [
  'SINGPASS_CLIENT_ID',
  'SINGPASS_ISSUER',
  'SINGPASS_REDIRECT_URI',
  'SINGPASS_SIGNING_KEY',
  'SINGPASS_ENCRYPTION_KEY',
] as const

const ENCRYPTION_ALGS = ['ECDH-ES+A128KW', 'ECDH-ES+A192KW', 'ECDH-ES+A256KW']

function parsePrivateJwk(raw: string | undefined, use: 'sig' | 'enc'): SingpassConfig['signingKey'] | null {
  if (!raw) return null
  let key: Record<string, unknown>
  try {
    key = JSON.parse(raw)
  } catch {
    return null
  }
  if (!key || typeof key !== 'object') return null
  if (key.kty !== 'EC' || typeof key.d !== 'string' || typeof key.kid !== 'string' || !key.kid) {
    return null
  }
  if (!['P-256', 'P-384', 'P-521'].includes(String(key.crv))) return null
  const alg = typeof key.alg === 'string' ? key.alg : ''
  if (use === 'sig' && !['ES256', 'ES384', 'ES512'].includes(alg)) return null
  if (use === 'enc' && !ENCRYPTION_ALGS.includes(alg)) return null
  return key as unknown as SingpassConfig['signingKey']
}

/**
 * Reads the five secrets. `missing` names the ones absent or malformed, so a
 * misconfigured project fails with a clear log line rather than a Singpass
 * `invalid_client`.
 */
export function readSingpassConfig(
  get: (name: string) => string | undefined,
): { ok: true; config: SingpassConfig } | { ok: false; missing: string[] } {
  const missing: string[] = REQUIRED_SECRETS.filter((name) => !(get(name) ?? '').trim())

  const clientId = (get('SINGPASS_CLIENT_ID') ?? '').trim()
  const issuer = (get('SINGPASS_ISSUER') ?? '').trim().replace(/\/$/, '')
  const redirectUri = (get('SINGPASS_REDIRECT_URI') ?? '').trim()
  const signingKey = parsePrivateJwk(get('SINGPASS_SIGNING_KEY'), 'sig')
  const encryptionKey = parsePrivateJwk(get('SINGPASS_ENCRYPTION_KEY'), 'enc')

  if (clientId && !/^[A-Za-z0-9]{32}$/.test(clientId)) missing.push('SINGPASS_CLIENT_ID (32 letters and digits)')
  if (issuer && !/^https:\/\/(stg-)?id\.singpass\.gov\.sg\/fapi$/.test(issuer)) {
    missing.push('SINGPASS_ISSUER (https://stg-id.singpass.gov.sg/fapi or https://id.singpass.gov.sg/fapi)')
  }
  if (redirectUri && !/^https:\/\/[^\s]+\/verify-identity\/singpass$/.test(redirectUri)) {
    missing.push('SINGPASS_REDIRECT_URI (https://<site>/verify-identity/singpass)')
  }
  if (get('SINGPASS_SIGNING_KEY') && !signingKey) missing.push('SINGPASS_SIGNING_KEY (private EC JWK, ES256)')
  if (get('SINGPASS_ENCRYPTION_KEY') && !encryptionKey) {
    missing.push('SINGPASS_ENCRYPTION_KEY (private EC JWK, ECDH-ES+A256KW)')
  }

  if (missing.length > 0 || !signingKey || !encryptionKey) {
    return { ok: false, missing: [...new Set(missing)] }
  }
  return { ok: true, config: { clientId, issuer, redirectUri, signingKey, encryptionKey } }
}

export function normalizeTeachingPlan(value: unknown):
  | { ok: true; plan: string }
  | { ok: false; error: string } {
  const plan = typeof value === 'string' ? value.trim() : ''
  if (plan.length < TEACHING_PLAN_MIN) {
    return { ok: false, error: "Tell us what you'd like to teach first." }
  }
  if (plan.length > TEACHING_PLAN_MAX) {
    return { ok: false, error: `What you'd like to teach must be ${TEACHING_PLAN_MAX} characters or fewer.` }
  }
  return { ok: true, plan }
}

/** The redirect's query string, as the page passes it on. */
export function parseSingpassCallback(query: unknown):
  | { ok: true; state: string; search: string }
  | { ok: false; state: string | null; reason: 'missing' | 'singpass_error' } {
  const raw = typeof query === 'string' ? query.trim() : ''
  const search = raw.startsWith('?') ? raw : `?${raw}`
  const params = new URLSearchParams(search)
  const state = params.get('state')
  if (!state || state.length > 255 || !/^[A-Za-z0-9/+_\-=.]+$/.test(state)) {
    return { ok: false, state: null, reason: 'missing' }
  }
  if (params.get('error')) return { ok: false, state, reason: 'singpass_error' }
  if (!params.get('code')) return { ok: false, state, reason: 'missing' }
  return { ok: true, state, search }
}

export function isSessionFresh(createdAt: string | null | undefined, now = new Date()): boolean {
  const created = createdAt ? Date.parse(createdAt) : NaN
  if (!Number.isFinite(created)) return false
  return now.getTime() - created <= SINGPASS_SESSION_MAX_AGE_MINUTES * 60 * 1000
}

/** What the ID token tells us, or why it is unusable. */
export function singpassIdentity(claims: unknown):
  | { ok: true; sub: string; name: string }
  | { ok: false; error: string } {
  const record = claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : null
  const sub = typeof record?.sub === 'string' ? record.sub.trim() : ''
  const attributes = record?.sub_attributes && typeof record.sub_attributes === 'object'
    ? (record.sub_attributes as Record<string, unknown>)
    : null
  const name = typeof attributes?.name === 'string' ? attributes.name.trim() : ''
  if (!sub) return { ok: false, error: 'Singpass did not return an identifier' }
  if (!name) return { ok: false, error: 'Singpass did not return a name' }
  return { ok: true, sub, name }
}

/** Host-facing copy. Singpass's own error text is never shown (content spoofing). */
export const SINGPASS_ERRORS = {
  notConfigured: "Singpass isn't available right now. Please upload your ID instead.",
  cancelled: "Singpass didn't finish. Try again, or upload your ID instead.",
  expired: 'That Singpass sign-in took too long. Please try again.',
  alreadyLinked: 'This Singpass is already linked to another TryKai account. Log in with that account, or contact hello@trykai.sg.',
  alreadyVerified: "You're already verified.",
  underReview: 'Your verification is already under review.',
  failed: 'We could not confirm your identity with Singpass. Please try again, or upload your ID instead.',
} as const

/** Maps a database error from record_singpass_verification to copy and a status. */
export function recordErrorResponse(message: string | null | undefined): { status: number; error: string } {
  const text = message ?? ''
  if (text.includes('singpass already linked')) return { status: 409, error: SINGPASS_ERRORS.alreadyLinked }
  if (text.includes('already verified')) return { status: 409, error: SINGPASS_ERRORS.alreadyVerified }
  return { status: 500, error: SINGPASS_ERRORS.failed }
}

/** The public half of a private JWK, as Singpass wants it in the app's JWKS. */
export function publicJwk(privateKey: JsonWebKey & { kid?: string; alg?: string }, use: 'sig' | 'enc') {
  const { kty, crv, x, y, kid, alg } = privateKey
  return { kty, crv, x, y, kid, alg, use }
}
