import { describe, expect, it } from 'vitest'
import { cardIncludedLabel, cardPriceLabel } from './cardExtras'

describe('cardPriceLabel', () => {
  it('adds the session length after the price', () => {
    expect(cardPriceLabel('S$32/person', 120)).toBe('S$32/person · 2 hr')
    expect(cardPriceLabel('S$18/person', 90)).toBe('S$18/person · 1 hr 30 min')
  })

  it('keeps the price alone when the length is unknown', () => {
    expect(cardPriceLabel('S$18/person', null)).toBe('S$18/person')
    expect(cardPriceLabel('S$18/person', 0)).toBe('S$18/person')
  })
})

describe('cardIncludedLabel', () => {
  it('prefers food and drinks, then materials', () => {
    expect(cardIncludedLabel(['Materials', 'Food & drinks'])).toBe('Food & drinks included')
    expect(cardIncludedLabel(['Equipment', 'Materials'])).toBe('Materials included')
  })

  it('shows nothing for equipment only, none, or missing data', () => {
    expect(cardIncludedLabel(['Equipment'])).toBeNull()
    expect(cardIncludedLabel(['None'])).toBeNull()
    expect(cardIncludedLabel(null)).toBeNull()
  })
})
