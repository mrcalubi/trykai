import { describe, expect, it } from 'vitest'
import { formatDuration } from './duration'

describe('formatDuration', () => {
  it('reads whole and half hours like the length chips', () => {
    expect(formatDuration(60)).toBe('1 hr')
    expect(formatDuration(90)).toBe('1.5 hr')
    expect(formatDuration(120)).toBe('2 hr')
    expect(formatDuration(390)).toBe('6.5 hr')
  })

  it('keeps every length in hours, never minutes', () => {
    expect(formatDuration(45)).toBe('0.75 hr')
    expect(formatDuration(75)).toBe('1.25 hr')
    expect(formatDuration(80)).toBe('1.33 hr')
    expect(formatDuration(100)).toBe('1.67 hr')
    expect(formatDuration(200)).toBe('3.33 hr')
    for (const mins of [1, 33, 45, 80, 100, 111, 200]) {
      expect(formatDuration(mins)).toMatch(/^\d+(\.\d{1,2})? hr$/)
    }
  })

  it('accepts the minutes as a string, as the editor holds them', () => {
    expect(formatDuration('90')).toBe('1.5 hr')
  })

  it('returns empty for missing or invalid lengths', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration('')).toBe('')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(-10)).toBe('')
  })
})
