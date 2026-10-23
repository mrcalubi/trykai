import { describe, expect, it } from 'vitest'
import { missingItemsMessage, missingVerificationItems } from './verificationForm'

const file = {}

describe('verify form gaps', () => {
  it('lists gaps in page order', () => {
    expect(missingVerificationItems({ plan: '', idPhoto: null, selfie: null, consent: false })).toEqual([
      "what you'd like to teach",
      'a photo of your ID',
      'a selfie',
      'a tick in the agreement box',
    ])
    expect(missingVerificationItems({ plan: 'yoga', idPhoto: file, selfie: file, consent: true })).toEqual([])
    expect(missingVerificationItems({ plan: ' ab ', idPhoto: file, selfie: file, consent: true })).toEqual([
      "what you'd like to teach",
    ])
  })

  it('joins one, two or more items in plain English', () => {
    expect(missingItemsMessage([])).toBe('')
    expect(missingItemsMessage(['a selfie'])).toBe('Still needed: a selfie.')
    expect(missingItemsMessage(['a selfie', 'a tick'])).toBe('Still needed: a selfie and a tick.')
    expect(missingItemsMessage(['x', 'y', 'z'])).toBe('Still needed: x, y and z.')
  })
})
