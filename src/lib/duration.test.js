import { describe, expect, it } from 'vitest'
import { formatDuration } from './duration'

describe('formatDuration', () => {
  it('uses hours and minutes, never a raw minute count for long sessions', () => {
    expect(formatDuration(390)).toBe('6 hr 30 min')
    expect(formatDuration(90)).toBe('1 hr 30 min')
    expect(formatDuration(60)).toBe('1 hr')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(1)).toBe('1 min')
  })

  it('returns empty for missing or invalid lengths', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(-10)).toBe('')
  })
})
