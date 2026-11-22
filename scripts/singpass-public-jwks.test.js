import { describe, expect, it } from 'vitest'
import { generateSingpassKeys } from '../src/lib/singpassKeys.js'
import { publicJwk, publicJwks } from './singpass-public-jwks.mjs'

describe('publicJwks', () => {
  it('rebuilds box 3 exactly from boxes 1 and 2', async () => {
    const keys = await generateSingpassKeys()
    const rebuilt = publicJwks({
      SINGPASS_SIGNING_KEY: keys.signingKey,
      SINGPASS_ENCRYPTION_KEY: keys.encryptionKey,
    })
    expect(JSON.parse(rebuilt)).toEqual(JSON.parse(keys.jwks))
    expect(rebuilt).not.toContain('"d"')
  })

  it('names the missing or wrong key', () => {
    expect(() => publicJwks({})).toThrow('Set SINGPASS_SIGNING_KEY first.')
    expect(() => publicJwk('SINGPASS_ENCRYPTION_KEY', 'not json', 'enc')).toThrow('is not JSON')
    expect(() => publicJwk('SINGPASS_SIGNING_KEY', '{"kty":"EC"}', 'sig')).toThrow('has no "crv"')
  })
})
