export const HERO_BADGE_POKE_PX = 12
export const HERO_BADGE_POKE_MS = 600

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function pokeOffset(pointer, center, distance = HERO_BADGE_POKE_PX) {
  const dx = center.x - pointer.x
  const dy = center.y - pointer.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return { x: 0, y: -distance }
  return { x: (dx / length) * distance, y: (dy / length) * distance }
}

export function pokeTransform(offset) {
  if (!offset) return ''
  return `translate(${offset.x}px, ${offset.y}px)`
}
