import { describe, expect, it } from 'vitest'
import { cardLengthNote } from './cardExtras'

describe('cardLengthNote', () => {
  it('reads as a short note after the price', () => {
    expect(cardLengthNote(120)).toBe('for 2 hr')
    expect(cardLengthNote(90)).toBe('for 1 hr 30 min')
  })

  it('shows nothing when the length is unknown', () => {
    expect(cardLengthNote(null)).toBeNull()
    expect(cardLengthNote(0)).toBeNull()
  })
})
