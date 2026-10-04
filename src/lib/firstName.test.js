import { describe, expect, it } from 'vitest'
import { firstName } from './firstName'

describe('firstName', () => {
  it('keeps a single given name', () => {
    expect(firstName('Arun')).toBe('Arun')
  })

  it('drops everything after the first word', () => {
    expect(firstName('Mei Ling Tan')).toBe('Mei')
  })

  it('trims extra spaces', () => {
    expect(firstName('  Siti  binti  ')).toBe('Siti')
  })

  it('returns an empty string when there is no name', () => {
    expect(firstName('')).toBe('')
    expect(firstName('   ')).toBe('')
    expect(firstName(null)).toBe('')
    expect(firstName(undefined)).toBe('')
  })
})
