/**
 * Singpass Myinfo for host verification (00035, DECISIONS.md 23 October).
 * Pure helpers only, so the test suite can exercise them without Deno or the
 * network. The OIDC exchange itself lives in singpass-start and
 * singpass-callback, using openid-client as Singpass's own demo app does.
 *
 * Scopes are `name dob mobileno`: the government-verified name, the date of
 * birth (so hosts are really 18 or older) and the mobile number registered
 * with Singpass (to reach a host on the day). Singpass's UUID for the person
 * (`sub`) keeps one Singpass to one host account. No NRIC number is requested.
 */

export const SINGPASS_SCOPE = 'openid name dob mobileno'

/** Hosts must be 18 or older (Terms). */
export const MIN_HOST_AGE = 18

/**
 * Singpass gives the user 10 minutes to log in, then the host reviews what
 * came back before confirming; past this the retrieved details are purged.
 */
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

export type MyinfoPerson = {
  sub: string
  name: string
  /** As Singpass has it: YYYY-MM-DD, or YYYY-MM / YYYY when only partly known. */
  dob: string
  /** E.164, e.g. +6591234567, or null when Singpass has none. */
  mobile: string | null
}

function itemValue(item: unknown): string {
  const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
  if (!record || record.unavailable === true) return ''
  return typeof record.value === 'string' ? record.value.trim() : ''
}

function mobileNumber(item: unknown): string | null {
  const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
  if (!record || record.unavailable === true) return null
  const nbr = itemValue(record.nbr).replace(/\s+/g, '')
  if (!/^\d{4,12}$/.test(nbr)) return null
  const areacode = (itemValue(record.areacode) || '65').replace(/\D/g, '')
  return `+${areacode}${nbr}`
}

/**
 * The userinfo payload (person_info) checked against the ID token's sub.
 * A name and a date of birth are required; a mobile number is not, since
 * Singpass may not hold one.
 */
export function myinfoPerson(idTokenClaims: unknown, userinfo: unknown):
  | { ok: true; person: MyinfoPerson }
  | { ok: false; error: string } {
  const claims = idTokenClaims && typeof idTokenClaims === 'object'
    ? (idTokenClaims as Record<string, unknown>)
    : null
  const info = userinfo && typeof userinfo === 'object' ? (userinfo as Record<string, unknown>) : null
  const sub = typeof claims?.sub === 'string' ? claims.sub.trim() : ''
  if (!sub) return { ok: false, error: 'Singpass did not return an identifier' }
  if (typeof info?.sub === 'string' && info.sub.trim() !== sub) {
    return { ok: false, error: 'Singpass userinfo is for a different person' }
  }
  const person = info?.person_info && typeof info.person_info === 'object'
    ? (info.person_info as Record<string, unknown>)
    : null
  const name = itemValue(person?.name)
  const dob = itemValue(person?.dob)
  if (!name) return { ok: false, error: 'Singpass did not return a name' }
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(dob)) return { ok: false, error: 'Singpass did not return a date of birth' }
  return { ok: true, person: { sub, name, dob, mobile: mobileNumber(person?.mobileno) } }
}

/**
 * Whether someone born on `dob` is at least MIN_HOST_AGE on `now` (Singapore
 * date). A partial date is read as the latest day it could be, so nobody who
 * might be 17 passes.
 */
export function isAdult(dob: string, now = new Date()): boolean {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(dob)
  if (!match) return false
  const year = Number(match[1])
  const month = match[2] ? Number(match[2]) : 12
  const day = match[3] ? Number(match[3]) : new Date(Date.UTC(year, month, 0)).getUTCDate()
  const sg = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const [y, m, d] = [sg.getUTCFullYear(), sg.getUTCMonth() + 1, sg.getUTCDate()]
  let age = y - year
  if (m < month || (m === month && d < day)) age -= 1
  return age >= MIN_HOST_AGE
}

/** What the page shows back, read-only, before the host confirms. */
export function singpassPreview(person: MyinfoPerson) {
  return { name: person.name, dob: person.dob, mobile: person.mobile }
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
  underAge: 'Hosts on TryKai must be 18 or older.',
  nothingToConfirm: 'That Singpass check has expired. Please verify again.',
} as const

/** Maps a database error from record_singpass_verification to copy and a status. */
export function recordErrorResponse(message: string | null | undefined): { status: number; error: string } {
  const text = message ?? ''
  if (text.includes('singpass already linked')) return { status: 409, error: SINGPASS_ERRORS.alreadyLinked }
  if (text.includes('already verified')) return { status: 409, error: SINGPASS_ERRORS.alreadyVerified }
  if (text.includes('under 18')) return { status: 403, error: SINGPASS_ERRORS.underAge }
  return { status: 500, error: SINGPASS_ERRORS.failed }
}

/** The public half of a private JWK, as Singpass wants it in the app's JWKS. */
export function publicJwk(privateKey: JsonWebKey & { kid?: string; alg?: string }, use: 'sig' | 'enc') {
  const { kty, crv, x, y, kid, alg } = privateKey
  return { kty, crv, x, y, kid, alg, use }
}
