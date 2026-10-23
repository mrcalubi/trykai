import { describe, expect, it } from 'vitest'
import {
  isSessionFresh,
  normalizeTeachingPlan,
  parseSingpassCallback,
  publicJwk,
  readSingpassConfig,
  recordErrorResponse,
  SINGPASS_AUTH_CONTEXT_MESSAGE,
  SINGPASS_ERRORS,
  SINGPASS_SCOPE,
  singpassIdentity,
} from './singpass.ts'

const SIG = {
  kty: 'EC', crv: 'P-256', x: 'x1', y: 'y1', d: 'd1', kid: 'trykai-sig-1', alg: 'ES256',
}
const ENC = {
  kty: 'EC', crv: 'P-256', x: 'x2', y: 'y2', d: 'd2', kid: 'trykai-enc-1', alg: 'ECDH-ES+A256KW',
}
const GOOD: Record<string, string> = {
  SINGPASS_CLIENT_ID: 'A'.repeat(32),
  SINGPASS_ISSUER: 'https://stg-id.singpass.gov.sg/fapi/',
  SINGPASS_REDIRECT_URI: 'https://trykai.vercel.app/verify-identity/singpass',
  SINGPASS_SIGNING_KEY: JSON.stringify(SIG),
  SINGPASS_ENCRYPTION_KEY: JSON.stringify(ENC),
}

function env(overrides: Record<string, string | undefined> = {}) {
  const values = { ...GOOD, ...overrides }
  return (name: string) => values[name]
}

describe('readSingpassConfig', () => {
  it('reads all five secrets and trims the issuer', () => {
    const result = readSingpassConfig(env())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.issuer).toBe('https://stg-id.singpass.gov.sg/fapi')
    expect(result.config.clientId).toBe('A'.repeat(32))
    expect(result.config.signingKey.kid).toBe('trykai-sig-1')
    expect(result.config.encryptionKey.alg).toBe('ECDH-ES+A256KW')
  })

  it('accepts the production issuer', () => {
    expect(readSingpassConfig(env({ SINGPASS_ISSUER: 'https://id.singpass.gov.sg/fapi' })).ok).toBe(true)
  })

  it('names every missing secret, so a half-set project fails clearly', () => {
    const result = readSingpassConfig(() => undefined)
    expect(result).toEqual({
      ok: false,
      missing: [
        'SINGPASS_CLIENT_ID',
        'SINGPASS_ISSUER',
        'SINGPASS_REDIRECT_URI',
        'SINGPASS_SIGNING_KEY',
        'SINGPASS_ENCRYPTION_KEY',
      ],
    })
  })

  it('rejects malformed values', () => {
    const result = readSingpassConfig(
      env({
        SINGPASS_CLIENT_ID: 'short',
        SINGPASS_ISSUER: 'https://evil.example/fapi',
        SINGPASS_REDIRECT_URI: 'http://trykai.sg/callback',
        SINGPASS_SIGNING_KEY: '{not json',
        SINGPASS_ENCRYPTION_KEY: JSON.stringify({ ...ENC, alg: 'RSA-OAEP' }),
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.missing.join(' | ')).toMatch(/SINGPASS_CLIENT_ID \(32/)
    expect(result.missing.join(' | ')).toMatch(/SINGPASS_ISSUER \(/)
    expect(result.missing.join(' | ')).toMatch(/SINGPASS_REDIRECT_URI \(/)
    expect(result.missing.join(' | ')).toMatch(/SINGPASS_SIGNING_KEY \(/)
    expect(result.missing.join(' | ')).toMatch(/SINGPASS_ENCRYPTION_KEY \(/)
  })

  it('refuses a public key where a private one is needed, and the wrong curve or algorithm', () => {
    const { d: _d, ...publicOnly } = SIG
    expect(readSingpassConfig(env({ SINGPASS_SIGNING_KEY: JSON.stringify(publicOnly) })).ok).toBe(false)
    expect(readSingpassConfig(env({ SINGPASS_SIGNING_KEY: JSON.stringify({ ...SIG, crv: 'secp256k1' }) })).ok).toBe(false)
    expect(readSingpassConfig(env({ SINGPASS_SIGNING_KEY: JSON.stringify({ ...SIG, alg: 'RS256' }) })).ok).toBe(false)
    expect(readSingpassConfig(env({ SINGPASS_SIGNING_KEY: JSON.stringify({ ...SIG, kid: '' }) })).ok).toBe(false)
    expect(readSingpassConfig(env({ SINGPASS_SIGNING_KEY: 'null' })).ok).toBe(false)
  })
})

describe('Singpass request settings', () => {
  it('asks for the name only, never the NRIC', () => {
    expect(SINGPASS_SCOPE).toBe('openid name')
    expect(SINGPASS_SCOPE).not.toMatch(/identity|uinfin/)
  })

  it('keeps the on-screen message within Singpass rules', () => {
    expect(SINGPASS_AUTH_CONTEXT_MESSAGE.length).toBeLessThanOrEqual(100)
    expect(SINGPASS_AUTH_CONTEXT_MESSAGE).toMatch(/^[\x20-\x7E]+$/)
    expect(SINGPASS_AUTH_CONTEXT_MESSAGE).not.toMatch(/[<>\\`]/)
  })
})

describe('normalizeTeachingPlan', () => {
  it('trims and bounds the answer', () => {
    expect(normalizeTeachingPlan('  coffee art  ')).toEqual({ ok: true, plan: 'coffee art' })
    expect(normalizeTeachingPlan(' ab ').ok).toBe(false)
    expect(normalizeTeachingPlan(null).ok).toBe(false)
    expect(normalizeTeachingPlan('x'.repeat(601)).ok).toBe(false)
    expect(normalizeTeachingPlan('x'.repeat(600)).ok).toBe(true)
  })
})

describe('parseSingpassCallback', () => {
  it('accepts a code and state, with or without the question mark', () => {
    expect(parseSingpassCallback('?code=abc&state=s1.-_&iss=x')).toEqual({
      ok: true, state: 's1.-_', search: '?code=abc&state=s1.-_&iss=x',
    })
    expect(parseSingpassCallback('code=abc&state=s1').ok).toBe(true)
  })

  it('treats a Singpass error as cancelled and keeps the state for clean-up', () => {
    expect(parseSingpassCallback('?error=server_error&state=s1')).toEqual({
      ok: false, state: 's1', reason: 'singpass_error',
    })
  })

  it('refuses a missing code, a missing or odd state, or no query at all', () => {
    expect(parseSingpassCallback('?state=s1')).toEqual({ ok: false, state: 's1', reason: 'missing' })
    expect(parseSingpassCallback('?code=abc')).toEqual({ ok: false, state: null, reason: 'missing' })
    expect(parseSingpassCallback('?code=abc&state=<script>').ok).toBe(false)
    expect(parseSingpassCallback(`?code=abc&state=${'a'.repeat(256)}`).ok).toBe(false)
    expect(parseSingpassCallback(undefined).ok).toBe(false)
  })
})

describe('isSessionFresh', () => {
  const now = new Date('2026-10-23T08:00:00Z')
  it('allows 30 minutes, then refuses', () => {
    expect(isSessionFresh('2026-10-23T07:31:00Z', now)).toBe(true)
    expect(isSessionFresh('2026-10-23T07:29:00Z', now)).toBe(false)
    expect(isSessionFresh(null, now)).toBe(false)
    expect(isSessionFresh('not a date', now)).toBe(false)
  })
})

describe('singpassIdentity', () => {
  it('reads sub and the principal name from sub_attributes', () => {
    expect(singpassIdentity({ sub: ' u-1 ', sub_attributes: { name: ' TAN MEI LING ' } })).toEqual({
      ok: true, sub: 'u-1', name: 'TAN MEI LING',
    })
  })

  it('refuses a token with no sub or no name', () => {
    expect(singpassIdentity({ sub_attributes: { name: 'A' } }).ok).toBe(false)
    expect(singpassIdentity({ sub: 'u-1' }).ok).toBe(false)
    expect(singpassIdentity({ sub: 'u-1', sub_attributes: { name: '  ' } }).ok).toBe(false)
    expect(singpassIdentity(null).ok).toBe(false)
  })
})

describe('recordErrorResponse', () => {
  it('maps the database refusals to host copy', () => {
    expect(recordErrorResponse('singpass already linked')).toEqual({ status: 409, error: SINGPASS_ERRORS.alreadyLinked })
    expect(recordErrorResponse('already verified')).toEqual({ status: 409, error: SINGPASS_ERRORS.alreadyVerified })
    expect(recordErrorResponse('boom')).toEqual({ status: 500, error: SINGPASS_ERRORS.failed })
    expect(recordErrorResponse(null).status).toBe(500)
  })
})

describe('publicJwk', () => {
  it('drops the private part', () => {
    expect(publicJwk(SIG, 'sig')).toEqual({
      kty: 'EC', crv: 'P-256', x: 'x1', y: 'y1', kid: 'trykai-sig-1', alg: 'ES256', use: 'sig',
    })
  })
})
