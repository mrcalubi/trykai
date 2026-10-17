import { describe, expect, it } from 'vitest'
import { foundingHostFromRpc } from './foundingHost'

describe('foundingHostFromRpc', () => {
  it('keeps a definite boolean', () => {
    expect(foundingHostFromRpc(true, null)).toBe(true)
    expect(foundingHostFromRpc(false, null)).toBe(false)
  })

  it('treats an error or missing value as unknown', () => {
    expect(foundingHostFromRpc(true, { message: 'permission denied' })).toBeNull()
    expect(foundingHostFromRpc(null, null)).toBeNull()
    expect(foundingHostFromRpc(undefined, null)).toBeNull()
  })
})
