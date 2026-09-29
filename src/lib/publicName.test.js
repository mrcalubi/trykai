import { describe, expect, it } from 'vitest'
import { publicName } from './publicName'

describe('publicName', () => {
  it('returns the display name when one is set', () => {
    expect(publicName({ display_name: 'Latte Queen', full_name: 'Mei Ling Tan' })).toBe(
      'Latte Queen'
    )
  })

  it('trims the display name', () => {
    expect(publicName({ display_name: '  Arun  ', full_name: 'Arun Kumar' })).toBe('Arun')
  })

  it('falls back to the first word of full_name when display_name is empty', () => {
    expect(publicName({ display_name: '', full_name: 'Mei Ling Tan' })).toBe('Mei')
    expect(publicName({ display_name: '   ', full_name: 'Mei Ling Tan' })).toBe('Mei')
    expect(publicName({ full_name: 'Mei Ling Tan' })).toBe('Mei')
  })

  it('returns an empty string when there is no name', () => {
    expect(publicName(null)).toBe('')
    expect(publicName(undefined)).toBe('')
    expect(publicName({})).toBe('')
  })
})
