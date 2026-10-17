import { describe, expect, it } from 'vitest'
import { hostEntry } from './hostEntry'

describe('hostEntry', () => {
  it('sends an approved host to create listing', () => {
    expect(hostEntry('approved')).toEqual({
      label: 'Host a session',
      to: '/create-listing',
    })
  })

  it('sends everyone else to verification', () => {
    expect(hostEntry('pending')).toEqual({
      label: 'Become a host',
      to: '/verify-identity',
    })
    expect(hostEntry('unverified')).toEqual({
      label: 'Become a host',
      to: '/verify-identity',
    })
    expect(hostEntry('rejected')).toEqual({
      label: 'Become a host',
      to: '/verify-identity',
    })
    expect(hostEntry(null)).toEqual({
      label: 'Become a host',
      to: '/verify-identity',
    })
  })
})
