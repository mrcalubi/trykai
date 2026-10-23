import { describe, expect, it } from 'vitest'
import { ageFromDob, formatSingpassDob, singpassEnabled } from './singpass'

describe('singpassEnabled', () => {
  it('is on only when the environment says true', () => {
    expect(singpassEnabled({ VITE_SINGPASS_ENABLED: 'true' })).toBe(true)
    expect(singpassEnabled({ VITE_SINGPASS_ENABLED: 'false' })).toBe(false)
    expect(singpassEnabled({})).toBe(false)
    expect(singpassEnabled(undefined)).toBe(false)
  })
})

describe('formatSingpassDob', () => {
  it('formats full and partial dates', () => {
    expect(formatSingpassDob('1998-05-17')).toBe('17 May 1998')
    expect(formatSingpassDob('1998-05')).toBe('May 1998')
    expect(formatSingpassDob('1998')).toBe('1998')
    expect(formatSingpassDob('odd')).toBe('odd')
    expect(formatSingpassDob(null)).toBe('')
  })
})

describe('ageFromDob', () => {
  const now = new Date(2026, 9, 23)
  it('counts whole years, low for partial dates', () => {
    expect(ageFromDob('1998-05-17', now)).toBe(28)
    expect(ageFromDob('2008-10-24', now)).toBe(17)
    expect(ageFromDob('2008-10-23', now)).toBe(18)
    expect(ageFromDob('2008', now)).toBe(17)
    expect(ageFromDob('2008-09', now)).toBe(18)
    expect(ageFromDob('nope', now)).toBe(null)
  })
})
