import { describe, expect, it } from 'vitest'
import {
  isAdult,
  isSessionFresh,
  myinfoPerson,
  parseSingpassCallback,
  publicJwk,
  readSingpassConfig,
  recordErrorResponse,
  SINGPASS_ERRORS,
  SINGPASS_SCOPE,
  singpassPreview,
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
  it('asks for name, date of birth and mobile, never the NRIC', () => {
    expect(SINGPASS_SCOPE).toBe('openid name dob mobileno')
    expect(SINGPASS_SCOPE).not.toMatch(/identity|uinfin/)
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

const ITEM = (value: string) => ({ lastupdated: '2026-01-01', source: '1', classification: 'C', value })
const USERINFO = {
  sub: 'u-1',
  person_info: {
    name: ITEM(' TAN MEI LING '),
    dob: ITEM('1998-05-17'),
    mobileno: { prefix: { value: '+' }, areacode: { value: '65' }, nbr: { value: '9739 9245' } },
  },
}

describe('myinfoPerson', () => {
  it('reads name, date of birth and mobile, checked against the ID token', () => {
    expect(myinfoPerson({ sub: 'u-1' }, USERINFO)).toEqual({
      ok: true,
      person: { sub: 'u-1', name: 'TAN MEI LING', dob: '1998-05-17', mobile: '+6597399245' },
    })
  })

  it('keeps going without a mobile, or with one Singpass marks unavailable', () => {
    const noMobile = { ...USERINFO, person_info: { ...USERINFO.person_info, mobileno: undefined } }
    expect(myinfoPerson({ sub: 'u-1' }, noMobile)).toMatchObject({ ok: true, person: { mobile: null } })
    const unavailable = { ...USERINFO, person_info: { ...USERINFO.person_info, mobileno: { unavailable: true } } }
    expect(myinfoPerson({ sub: 'u-1' }, unavailable)).toMatchObject({ ok: true, person: { mobile: null } })
    const junk = { ...USERINFO, person_info: { ...USERINFO.person_info, mobileno: { nbr: { value: 'abc' } } } }
    expect(myinfoPerson({ sub: 'u-1' }, junk)).toMatchObject({ ok: true, person: { mobile: null } })
  })

  it('defaults the area code to 65', () => {
    const noArea = { ...USERINFO, person_info: { ...USERINFO.person_info, mobileno: { nbr: { value: '81234567' } } } }
    expect(myinfoPerson({ sub: 'u-1' }, noArea)).toMatchObject({ ok: true, person: { mobile: '+6581234567' } })
  })

  it('accepts a partial date of birth as Singpass sends it', () => {
    const partial = { ...USERINFO, person_info: { ...USERINFO.person_info, dob: ITEM('1998-05') } }
    expect(myinfoPerson({ sub: 'u-1' }, partial)).toMatchObject({ ok: true, person: { dob: '1998-05' } })
  })

  it('refuses a missing sub, a mismatched sub, or no name or date of birth', () => {
    expect(myinfoPerson({}, USERINFO).ok).toBe(false)
    expect(myinfoPerson({ sub: 'u-2' }, USERINFO).ok).toBe(false)
    expect(myinfoPerson({ sub: 'u-1' }, { ...USERINFO, person_info: { dob: ITEM('1998-05-17') } }).ok).toBe(false)
    expect(myinfoPerson({ sub: 'u-1' }, { ...USERINFO, person_info: { name: ITEM('A'), dob: { unavailable: true } } }).ok).toBe(false)
    expect(myinfoPerson({ sub: 'u-1' }, { ...USERINFO, person_info: { name: ITEM('A'), dob: ITEM('17/05/1998') } }).ok).toBe(false)
    expect(myinfoPerson({ sub: 'u-1' }, null).ok).toBe(false)
    expect(myinfoPerson(null, USERINFO).ok).toBe(false)
  })

  it('shows back only what the host reviews', () => {
    expect(singpassPreview({ sub: 'u-1', name: 'A', dob: '1998', mobile: null })).toEqual({
      name: 'A', dob: '1998', mobile: null,
    })
  })
})

describe('isAdult', () => {
  // 23 Oct 2026, 10:00 in Singapore.
  const now = new Date('2026-10-23T02:00:00Z')

  it('counts birthdays on the Singapore date', () => {
    expect(isAdult('2008-10-23', now)).toBe(true)
    expect(isAdult('2008-10-24', now)).toBe(false)
    expect(isAdult('1998-05-17', now)).toBe(true)
    // 23 Oct 23:30 UTC is already 24 Oct in Singapore.
    expect(isAdult('2008-10-24', new Date('2026-10-23T16:30:00Z'))).toBe(true)
  })

  it('reads a partial date as the latest it could be', () => {
    expect(isAdult('2008-10', now)).toBe(false)
    expect(isAdult('2008-09', now)).toBe(true)
    expect(isAdult('2008', now)).toBe(false)
    expect(isAdult('2007', now)).toBe(true)
    expect(isAdult('2008-02', new Date('2026-02-28T02:00:00Z'))).toBe(false)
    expect(isAdult('2008-02', new Date('2026-03-01T02:00:00Z'))).toBe(true)
  })

  it('refuses anything that is not a date', () => {
    expect(isAdult('', now)).toBe(false)
    expect(isAdult('17/05/1998', now)).toBe(false)
  })
})

describe('recordErrorResponse', () => {
  it('maps the database refusals to host copy', () => {
    expect(recordErrorResponse('singpass already linked')).toEqual({ status: 409, error: SINGPASS_ERRORS.alreadyLinked })
    expect(recordErrorResponse('already verified')).toEqual({ status: 409, error: SINGPASS_ERRORS.alreadyVerified })
    expect(recordErrorResponse('under 18')).toEqual({ status: 403, error: SINGPASS_ERRORS.underAge })
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
