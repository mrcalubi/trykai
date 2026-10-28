import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HeroBadge from './HeroBadge'

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
    const view = render(<HeroBadge src="/food.png" className="home-hero__badge--1" />)
    const wrapper = view.container.querySelector('.home-hero__badge')
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
    return { wrapper, unmount: view.unmount }
  }

  it('wraps the icon so the float can sit inside the poke target', () => {
    const { wrapper } = renderBadge()
    expect(wrapper.querySelector('.home-hero__badge-inner img')).toHaveAttribute(
      'src',
      '/food.png',
    )
    expect(wrapper.querySelector('img')).toHaveAttribute('alt', '')
    expect(wrapper).not.toHaveAttribute('tabindex')
  })

  it('animates a wobble whose first translate points away from the pointer', () => {
    const { wrapper } = renderBadge()
    const animation = { cancel: vi.fn() }
    wrapper.animate = vi.fn(() => animation)

    fireEvent.pointerDown(wrapper, { clientX: 0, clientY: 20 })

    expect(wrapper.animate).toHaveBeenCalledTimes(1)
    const frames = wrapper.animate.mock.calls[0][0]
    expect(frames[1].transform).toMatch(/^translate\(10px, 0px\)/)
    expect(frames[1].transform).toMatch(/rotate\(0deg\) scale\(0\.82, 1\.12\) rotate\(0deg\)/)
  })

  it('cancels the running wobble when poked again', () => {
    const { wrapper } = renderBadge()
    const first = { cancel: vi.fn() }
    const second = { cancel: vi.fn() }
    wrapper.animate = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)

    fireEvent.pointerDown(wrapper, { clientX: 0, clientY: 20 })
    fireEvent.pointerDown(wrapper, { clientX: 20, clientY: 40 })

    expect(first.cancel).toHaveBeenCalledTimes(1)
    expect(wrapper.animate).toHaveBeenCalledTimes(2)
  })

  it('does not animate when the visitor prefers reduced motion', () => {
    window.matchMedia.mockReturnValue({
      matches: true,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })
    const { wrapper } = renderBadge()
    wrapper.animate = vi.fn()

    fireEvent.pointerDown(wrapper, { clientX: 0, clientY: 20 })

    expect(wrapper.animate).not.toHaveBeenCalled()
  })

  it('cancels a running wobble on unmount', () => {
    const { wrapper, unmount } = renderBadge()
    const animation = { cancel: vi.fn() }
    wrapper.animate = vi.fn(() => animation)

    fireEvent.pointerDown(wrapper, { clientX: 0, clientY: 20 })
    unmount()

    expect(animation.cancel).toHaveBeenCalledTimes(1)
  })
})
