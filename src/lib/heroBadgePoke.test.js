import { describe, expect, it } from 'vitest'
import { HERO_BADGE_POKE_PX, pokeOffset, pokeTransform } from './heroBadgePoke'

describe('pokeOffset', () => {
  it('moves the badge away from the pointer along the centre vector', () => {
    expect(pokeOffset({ x: 0, y: 10 }, { x: 10, y: 10 }, 12)).toEqual({ x: 12, y: 0 })
    expect(pokeOffset({ x: 10, y: 20 }, { x: 10, y: 10 }, 12)).toEqual({ x: 0, y: -12 })
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

describe('pokeTransform', () => {
  it('writes a translate or nothing', () => {
    expect(pokeTransform({ x: 12, y: -4 })).toBe('translate(12px, -4px)')
    expect(pokeTransform(null)).toBe('')
  })
})
