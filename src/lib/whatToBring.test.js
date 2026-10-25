import { describe, expect, it } from 'vitest'
import {
  MAX_WHAT_TO_BRING,
  MAX_WHAT_TO_BRING_CHARS,
  WHAT_TO_BRING_SUGGESTIONS,
  normalizeWhatToBringItem,
  whatToBringForSave,
} from './whatToBring'

describe('whatToBring', () => {
  it('trims, caps length, drops blanks and duplicates, and stops at five', () => {
    expect(normalizeWhatToBringItem('  Yoga mat  ')).toBe('Yoga mat')
    expect(normalizeWhatToBringItem('x'.repeat(41))).toBe('x'.repeat(MAX_WHAT_TO_BRING_CHARS))
    expect(
      whatToBringForSave(['  Water bottle ', 'Water bottle', '', 'Notebook and pen', 'A', 'B', 'C', 'D']),
    ).toEqual(['Water bottle', 'Notebook and pen', 'A', 'B', 'C'])
    expect(whatToBringForSave([])).toEqual([])
    expect(MAX_WHAT_TO_BRING).toBe(5)
    expect(WHAT_TO_BRING_SUGGESTIONS).toEqual([
      'Comfortable clothes',
      'Water bottle',
      'Notebook and pen',
    ])
  })
})
