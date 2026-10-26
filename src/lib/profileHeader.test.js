import { describe, expect, it } from 'vitest'
import { hostProfileStats, teachCategories } from './profileHeader'

describe('hostProfileStats', () => {
  it('returns null when there are no live listings', () => {
    expect(hostProfileStats([{ rating: 5 }], [])).toBeNull()
  })

  it('hides the rating when there are listings but no reviews', () => {
    expect(hostProfileStats([], [{ id: 'a' }, { id: 'b' }])).toEqual({
      average: null,
      reviewCount: 0,
      listingCount: 2,
    })
  })

  it('averages every review they received as a host', () => {
    expect(
      hostProfileStats([{ rating: 5 }, { rating: 4 }], [{ id: 'a' }, { id: 'b' }]),
    ).toEqual({
      average: 4.5,
      reviewCount: 2,
      listingCount: 2,
    })
  })
})

describe('teachCategories', () => {
  it('lists distinct categories in first-seen order', () => {
    expect(
      teachCategories([
        { category: 'Food' },
        { category: 'Food' },
        { category: 'Music' },
        { category: 'Arts' },
      ]),
    ).toEqual(['Food', 'Music', 'Arts'])
  })

  it('skips a blank category', () => {
    expect(teachCategories([{ category: '  ' }, { category: 'Fitness' }])).toEqual(['Fitness'])
  })
})
