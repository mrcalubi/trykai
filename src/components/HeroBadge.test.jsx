import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HeroBadge from './HeroBadge'
import { HERO_BADGE_POKE_PX } from '../lib/heroBadgePoke'

describe('HeroBadge', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderBadge() {
    const { container } = render(
      <HeroBadge src="/food.png" className="home-hero__badge--1" />,
    )
    const wrapper = container.querySelector('.home-hero__badge')
    wrapper.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 40,
      height: 40,
      right: 40,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    return wrapper
  }

  it('wraps the icon so the float can sit inside the poke target', () => {
    const wrapper = renderBadge()
    expect(wrapper.querySelector('.home-hero__badge-inner img')).toHaveAttribute(
      'src',
      '/food.png',
    )
    expect(wrapper.querySelector('img')).toHaveAttribute('alt', '')
    expect(wrapper).not.toHaveAttribute('tabindex')
  })

  it('sets a transform away from the pointer and clears it afterwards', async () => {
    vi.useFakeTimers()
    const wrapper = renderBadge()

    fireEvent.pointerDown(wrapper, { clientX: 0, clientY: 20 })

    expect(wrapper.style.transform).toBe(`translate(${HERO_BADGE_POKE_PX}px, 0px)`)

    await act(async () => {
      vi.runAllTimers()
    })

    expect(wrapper.style.transform).toBe('')
    vi.useRealTimers()
  })

  it('sets no transform when the visitor prefers reduced motion', () => {
    window.matchMedia.mockReturnValue({
      matches: true,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })
    const wrapper = renderBadge()

    fireEvent.pointerDown(wrapper, { clientX: 0, clientY: 20 })

    expect(wrapper.style.transform).toBe('')
  })
})
