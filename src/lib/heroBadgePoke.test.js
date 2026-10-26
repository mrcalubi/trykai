import { describe, expect, it } from 'vitest'
import {
  HERO_BADGE_POKE_MS,
  HERO_BADGE_POKE_PX,
  pokeOffset,
  pokeWobbleKeyframes,
  pokeWobbleOptions,
} from './heroBadgePoke'

describe('pokeOffset', () => {
  it('moves the badge away from the pointer along the centre vector', () => {
    expect(pokeOffset({ x: 0, y: 10 }, { x: 10, y: 10 }, 10)).toEqual({ x: 10, y: 0 })
    expect(pokeOffset({ x: 10, y: 20 }, { x: 10, y: 10 }, 10)).toEqual({ x: 0, y: -10 })
  })

  it('uses a default distance and a straight-up fallback on the centre', () => {
    expect(pokeOffset({ x: 4, y: 0 }, { x: 0, y: 0 })).toEqual({
      x: -HERO_BADGE_POKE_PX,
      y: 0,
    })
    expect(pokeOffset({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      x: 0,
      y: -HERO_BADGE_POKE_PX,
    })
  })
})

describe('pokeWobbleKeyframes', () => {
  it('writes a directed squash whose first move points away from the pointer', () => {
    const frames = pokeWobbleKeyframes({ x: 10, y: 0 })
    expect(frames[0].transform).toMatch(/^translate\(0px, 0px\) rotate\(0deg\)/)
    expect(frames[1].transform).toBe(
      'translate(10px, 0px) rotate(0deg) scale(0.82, 1.12) rotate(0deg)',
    )
    expect(frames[1].easing).toBe('ease-out')
    expect(frames.at(-1).transform).toMatch(/translate\(0px, 0px\).*scale\(1, 1\)/)
    expect(pokeWobbleOptions()).toEqual({ duration: HERO_BADGE_POKE_MS, easing: 'linear' })
  })
})
