import { describe, expect, it } from 'vitest'
import { hostCancelGuestPhrase, hostCancelWarning } from './hostCancelCopy'

describe('hostCancelGuestPhrase', () => {
  it('uses your guest, both guests, then all N', () => {
    expect(hostCancelGuestPhrase(1)).toBe('your guest')
    expect(hostCancelGuestPhrase(2)).toBe('both guests')
    expect(hostCancelGuestPhrase(3)).toBe('all 3 guests')
    expect(hostCancelGuestPhrase(4)).toBe('all 4 guests')
  })
})

describe('hostCancelWarning', () => {
  it('never mentions a dollar amount', () => {
    expect(hostCancelWarning(1)).toBe(
      'Cancelling refunds your guest in full and adds a strike to your account.',
    )
    expect(hostCancelWarning(2)).toBe(
      'Cancelling refunds both guests in full and adds a strike to your account.',
    )
    expect(hostCancelWarning(5)).toBe(
      'Cancelling refunds all 5 guests in full and adds a strike to your account.',
    )
    expect(hostCancelWarning(5)).not.toMatch(/\$/)
  })
})
