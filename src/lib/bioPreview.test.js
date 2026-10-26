import { describe, expect, it } from 'vitest'
import { previewBio } from './bioPreview'

describe('previewBio', () => {
  it('keeps a short bio intact', () => {
    expect(previewBio('I pull rosettas.')).toEqual({
      preview: 'I pull rosettas.',
      truncated: false,
    })
  })

  it('clamps to two lines by default', () => {
    expect(previewBio('One.\nTwo.\nThree.')).toEqual({
      preview: 'One.\nTwo.',
      truncated: true,
    })
  })

  it('clamps to three lines when asked', () => {
    expect(previewBio('One.\nTwo.\nThree.\nFour.', { lines: 3 })).toEqual({
      preview: 'One.\nTwo.\nThree.',
      truncated: true,
    })
  })

  it('cuts a long single line at a word boundary', () => {
    const words = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ')
    const { preview, truncated } = previewBio(words, { maxChars: 160 })
    expect(truncated).toBe(true)
    expect(preview.length).toBeLessThanOrEqual(160)
    expect(preview).not.toMatch(/\s$/)
  })
})
