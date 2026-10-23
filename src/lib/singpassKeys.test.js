import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { generateSingpassKeys } from './singpassKeys'
import { readSingpassConfig } from '../../supabase/functions/_shared/singpass.ts'

const subtle = webcrypto.subtle

function core(jwk) {
  const { kty, crv, x, y, d } = jwk
  return d ? { kty, crv, x, y, d } : { kty, crv, x, y }
}

describe('generateSingpassKeys', () => {
  it('makes P-256 keys that the Singpass functions accept as secrets', async () => {
    const keys = await generateSingpassKeys({ subtle, now: new Date('2026-10-23T00:00:00Z') })
    const config = readSingpassConfig((name) => ({
      SINGPASS_CLIENT_ID: 'A'.repeat(32),
      SINGPASS_ISSUER: 'https://stg-id.singpass.gov.sg/fapi',
      SINGPASS_REDIRECT_URI: 'https://trykai.vercel.app/verify-identity/singpass',
      SINGPASS_SIGNING_KEY: keys.signingKey,
      SINGPASS_ENCRYPTION_KEY: keys.encryptionKey,
    })[name])
    expect(config.ok).toBe(true)
    expect(JSON.parse(keys.signingKey).kid).toMatch(/^trykai-sig-20261023-/)
  })

  it('publishes only public halves, one sig and one enc', async () => {
    const keys = await generateSingpassKeys({ subtle })
    const jwks = JSON.parse(keys.jwks)
    expect(jwks.keys).toHaveLength(2)
    for (const key of jwks.keys) {
      expect(key.d).toBeUndefined()
      expect(key).toMatchObject({ kty: 'EC', crv: 'P-256' })
    }
    expect(jwks.keys[0]).toMatchObject({ use: 'sig', alg: 'ES256' })
    expect(jwks.keys[1]).toMatchObject({ use: 'enc', alg: 'ECDH-ES+A256KW' })
    expect(jwks.keys[0].kid).not.toBe(jwks.keys[1].kid)
    expect(jwks.keys[0].kid).toBe(JSON.parse(keys.signingKey).kid)
  })

  it('makes keys that actually sign, verify and agree', async () => {
    const keys = await generateSingpassKeys({ subtle })
    const jwks = JSON.parse(keys.jwks)
    const sigPrivate = core(JSON.parse(keys.signingKey))
    const sigPublic = core(jwks.keys[0])
    const priv = await subtle.importKey('jwk', sigPrivate, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
    const pub = await subtle.importKey('jwk', sigPublic, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const data = new TextEncoder().encode('trykai')
    const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, data)
    expect(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, signature, data)).toBe(true)

    const encPrivate = core(JSON.parse(keys.encryptionKey))
    await expect(
      subtle.importKey('jwk', encPrivate, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
    ).resolves.toBeTruthy()
  })

  it('says so when the browser has no WebCrypto', async () => {
    await expect(generateSingpassKeys({ subtle: null })).rejects.toThrow(/cannot generate keys/)
  })
})
