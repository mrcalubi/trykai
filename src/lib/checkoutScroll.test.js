import { describe, expect, it } from 'vitest'
import { shouldBringCheckoutIntoView } from './checkoutScroll'

describe('shouldBringCheckoutIntoView', () => {
  it('scrolls on desktop when the top of checkout is above the screen', () => {
    expect(shouldBringCheckoutIntoView(true, -900)).toBe(true)
  })

  it('leaves the page alone when checkout is already in view', () => {
    expect(shouldBringCheckoutIntoView(true, 88)).toBe(false)
    expect(shouldBringCheckoutIntoView(true, 0)).toBe(false)
  })

  it('never scrolls on phones or when the position is unknown', () => {
    expect(shouldBringCheckoutIntoView(false, -900)).toBe(false)
    expect(shouldBringCheckoutIntoView(true, undefined)).toBe(false)
  })
})
