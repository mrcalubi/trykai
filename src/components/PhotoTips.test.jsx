import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PhotoTips from './PhotoTips'
import { PHOTO_TIPS, PHOTO_TIPS_NOTE, PHOTO_TIPS_TITLE } from '../lib/photoTips'

describe('PhotoTips', () => {
  it('recommends five starting shots and the daylight tip', () => {
    render(<PhotoTips />)

    expect(screen.getByText("Five shots we'd start with")).toBeInTheDocument()
    expect(PHOTO_TIPS_TITLE).toBe("Five shots we'd start with")
    expect(PHOTO_TIPS).toHaveLength(5)
    for (const tip of PHOTO_TIPS) expect(screen.getByText(tip)).toBeInTheDocument()
    expect(screen.getByText(PHOTO_TIPS_NOTE)).toBeInTheDocument()
  })

  it('uses no em dashes', () => {
    for (const line of [PHOTO_TIPS_TITLE, ...PHOTO_TIPS, PHOTO_TIPS_NOTE]) {
      expect(line).not.toMatch(/\u2014/)
    }
  })
})
