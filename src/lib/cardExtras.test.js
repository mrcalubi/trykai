import { describe, expect, it } from 'vitest'
import { cardLength } from './cardExtras'

describe('cardLength', () => {
  it('reads whole and half hours like the length chips', () => {
    expect(cardLength(60)).toBe('1 hr')
    expect(cardLength(90)).toBe('1.5 hr')
    expect(cardLength(120)).toBe('2 hr')
    expect(cardLength(150)).toBe('2.5 hr')
  })

  it('keeps short sessions in minutes', () => {
    expect(cardLength(45)).toBe('45 min')
  })

  it('keeps any other length in minutes, so the tag stays short', () => {
    expect(cardLength(80)).toBe('80 min')
    expect(cardLength(200)).toBe('200 min')
  })

  it('shows nothing when the length is unknown', () => {
    expect(cardLength(null)).toBeNull()
    expect(cardLength(undefined)).toBeNull()
    expect(cardLength(0)).toBeNull()
    expect(cardLength(12.5)).toBeNull()
  })
})
