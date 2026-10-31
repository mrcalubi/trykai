import { describe, expect, it } from 'vitest'
import { draftValues, isBlankDraft } from './listingDraft'

describe('isBlankDraft', () => {
  it('treats missing and default wizard values as blank', () => {
    expect(isBlankDraft(null)).toBe(true)
    expect(isBlankDraft({})).toBe(true)
    expect(isBlankDraft(draftValues(null))).toBe(true)
    expect(isBlankDraft({ maxGuests: 4, groupPricing: true, step: 0 })).toBe(true)
  })

  it('keeps a draft that has any real answer', () => {
    expect(isBlankDraft({ title: 'Pottery' })).toBe(false)
    expect(isBlankDraft({ durationChoice: 60 })).toBe(false)
    expect(isBlankDraft({ whatsProvided: ['Materials'] })).toBe(false)
    expect(isBlankDraft({ addons: [{ name: 'Take-home kit', price: '15' }] })).toBe(false)
    expect(isBlankDraft({ arrivalInstructions: 'Lift B' })).toBe(false)
    expect(isBlankDraft({ bookingCutoffHours: 12 })).toBe(false)
  })
})
