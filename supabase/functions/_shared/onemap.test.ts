import { describe, expect, it, vi } from 'vitest'
import {
  POSTAL_LOOKUP_LIMIT,
  allowPostalLookup,
  composeFullAddress,
  hasBearerJwt,
  isCachedTokenFresh,
  isValidPostal,
  oneMapAccessToken,
  publicSearchHits,
  searchOneMapPostal,
} from './onemap.ts'

describe('onemap helpers', () => {
  it('accepts only a 6-digit postal code', () => {
    expect(isValidPostal('470012')).toBe(true)
    expect(isValidPostal(' 470012 ')).toBe(true)
    expect(isValidPostal('47001')).toBe(false)
    expect(isValidPostal('4700123')).toBe(false)
    expect(isValidPostal('47A012')).toBe(false)
  })

  it('inserts the unit number before SINGAPORE', () => {
    expect(composeFullAddress('12 COFFEE ROAD SINGAPORE 470012', '#05-12')).toBe(
      '12 COFFEE ROAD #05-12 SINGAPORE 470012',
    )
    expect(composeFullAddress('12 COFFEE ROAD SINGAPORE 470012', '  ')).toBe(
      '12 COFFEE ROAD SINGAPORE 470012',
    )
    expect(composeFullAddress('12 Coffee Road', '#05-12')).toBe('12 Coffee Road #05-12')
  })

  it('returns public address rows and drops empty hits', () => {
    expect(
      publicSearchHits([
        {
          ADDRESS: ' 12 COFFEE ROAD SINGAPORE 470012 ',
          POSTAL: '470012',
          BUILDING: 'NIL',
        },
        { ADDRESS: '', POSTAL: '000000' },
      ]),
    ).toEqual([
      { address: '12 COFFEE ROAD SINGAPORE 470012', postal: '470012', building: '' },
    ])
  })

  it('requests a OneMap token with the registered email and password', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok-1', expiry_timestamp: '1700000000' }),
    })
    await expect(oneMapAccessToken(fetchImpl, 'host@example.com', 'secret')).resolves.toEqual({
      access_token: 'tok-1',
      expiryTimestamp: 1700000000,
    })
    expect(fetchImpl).toHaveBeenCalledWith('https://www.onemap.gov.sg/api/auth/post/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'host@example.com', password: 'secret' }),
    })
  })

  it('reuses a cached token until near expiry', () => {
    expect(isCachedTokenFresh(1_700_000_000, 1_700_000_000 * 1000 - 6 * 60 * 1000)).toBe(true)
    expect(isCachedTokenFresh(1_700_000_000, 1_700_000_000 * 1000 - 60 * 1000)).toBe(false)
  })

  it('requires a Bearer JWT and rate-limits lookups per user', () => {
    expect(hasBearerJwt('Bearer abc.def.ghi')).toBe(true)
    expect(hasBearerJwt('abc.def.ghi')).toBe(false)
    expect(hasBearerJwt(null)).toBe(false)

    const hits = new Map()
    const now = 1_000_000
    for (let i = 0; i < POSTAL_LOOKUP_LIMIT; i += 1) {
      expect(allowPostalLookup(hits, 'user-1', now + i)).toBe(true)
    }
    expect(allowPostalLookup(hits, 'user-1', now + POSTAL_LOOKUP_LIMIT)).toBe(false)
    expect(allowPostalLookup(hits, 'user-2', now)).toBe(true)
    expect(allowPostalLookup(hits, 'user-1', now + 10 * 60 * 1000 + 1)).toBe(true)
  })

  it('searches OneMap with the token and a postal code', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ ADDRESS: '12 COFFEE ROAD SINGAPORE 470012', POSTAL: '470012' }],
      }),
    })
    const rows = await searchOneMapPostal(fetchImpl, 'tok-1', '470012')
    expect(rows).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.onemap.gov.sg/api/common/elastic/search?searchVal=470012&returnGeom=N&getAddrDetails=Y&pageNum=1',
      { headers: { Authorization: 'tok-1' } },
    )
  })

  it('throws when OneMap reports a token error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'Authentication token expired. Tokens is valid for 3 days.' }),
    })
    await expect(searchOneMapPostal(fetchImpl, 'old', '470012')).rejects.toThrow(/token expired/i)
  })
})
